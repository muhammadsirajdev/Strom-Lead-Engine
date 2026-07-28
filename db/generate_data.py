"""Populate the StormLead Postgres database with synthetic customers + tracking data.

Usage:
    uv run python db/generate_data.py --customers 400 --seed 42
"""

import argparse
import json
import os
import random
import secrets
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import psycopg
from dotenv import load_dotenv

SCHEMA_PATH = Path(__file__).parent / "schema.sql"

# (zip, city, state) — storm-prone metros in TX, CO, FL.
METROS = [
    ("75201", "Dallas", "TX"),
    ("77002", "Houston", "TX"),
    ("78701", "Austin", "TX"),
    ("78201", "San Antonio", "TX"),
    ("80202", "Denver", "CO"),
    ("80903", "Colorado Springs", "CO"),
    ("33602", "Tampa", "FL"),
    ("32801", "Orlando", "FL"),
    ("33101", "Miami", "FL"),
    ("32202", "Jacksonville", "FL"),
]

AREA_CODES = {
    "TX": ["214", "713", "512", "210"],
    "CO": ["303", "719"],
    "FL": ["813", "407", "305", "904"],
}

FIRST_NAMES = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
    "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    "Thomas", "Sarah", "Charles", "Karen", "Carlos", "Maria", "Luis", "Sofia",
    "Daniel", "Nancy", "Matthew", "Lisa", "Anthony", "Betty", "Mark", "Sandra",
    "Kevin", "Ashley", "Steven", "Emily", "Brian", "Michelle", "Jose", "Carmen",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
]

STREET_NAMES = [
    "Oak", "Maple", "Cedar", "Elm", "Pine", "Sunset", "Willow", "Magnolia",
    "Live Oak", "Bluebonnet", "Rocky Ridge", "Lakeshore", "Palmetto", "Gulf Breeze",
    "Prairie", "Mesa", "Canyon", "Coral", "Meadow", "Highland",
]
STREET_SUFFIXES = ["St", "Ave", "Dr", "Ln", "Ct", "Way", "Blvd", "Trail"]

ROOF_MATERIALS = [("asphalt_shingle", 0.65), ("metal", 0.15), ("tile", 0.12), ("flat_tpo", 0.08)]
JOB_TYPES = [("repair", 0.40), ("inspection", 0.25), ("gutters", 0.20), ("replacement", 0.15)]
JOB_VALUE_RANGES = {
    "replacement": (8000, 22000),
    "repair": (600, 3000),
    "inspection": (0, 350),
    "gutters": (1500, 5000),
}
INSURERS = [
    "State Farm", "Allstate", "USAA", "Farmers", "Liberty Mutual",
    "Progressive", "Nationwide", "Travelers",
]
# Non-terminal: awaiting_reply, interested, not_interested (Run B keeps polling).
# Terminal: booked, no_response, unsubscribed (Run B stops watching).
TRACKING_STATUSES = [
    ("awaiting_reply", 0.40), ("interested", 0.12), ("not_interested", 0.13),
    ("booked", 0.15), ("no_response", 0.15), ("unsubscribed", 0.05),
]
NO_REPLY_YET_STATUSES = {"awaiting_reply", "no_response"}


def weighted_choice(rng, pairs):
    items, weights = zip(*pairs)
    return rng.choices(items, weights=weights, k=1)[0]


def gen_customers(rng, n):
    rows = []
    emails_seen = set()
    today = date.today()

    for _ in range(n):
        zip_, city, state = rng.choice(METROS)
        first = rng.choice(FIRST_NAMES)
        last = rng.choice(LAST_NAMES)

        base = f"{first.lower()}.{last.lower()}"
        email = f"{base}@example.com"
        suffix = 1
        while email in emails_seen:
            suffix += 1
            email = f"{base}{suffix}@example.com"
        emails_seen.add(email)

        area_code = rng.choice(AREA_CODES[state])
        phone = f"({area_code}) {rng.randint(200, 999)}-{rng.randint(1000, 9999)}"

        street = f"{rng.randint(100, 9999)} {rng.choice(STREET_NAMES)} {rng.choice(STREET_SUFFIXES)}"

        roof_material = weighted_choice(rng, ROOF_MATERIALS)
        roof_age_years = rng.randint(2, 28)

        job_type = weighted_choice(rng, JOB_TYPES)
        lo, hi = JOB_VALUE_RANGES[job_type]
        job_value = round(rng.uniform(lo, hi), 2)

        days_ago = rng.randint(0, 4 * 365)
        last_job_date = today - timedelta(days=days_ago)
        created_at = datetime.combine(last_job_date, datetime.min.time(), tzinfo=timezone.utc) - timedelta(
            days=rng.randint(1, 30)
        )

        insurance_carrier = rng.choice(INSURERS) if rng.random() > 0.20 else None
        marketing_opt_in = rng.random() > 0.08

        rows.append(
            (
                first, last, email, phone, street, city, state, zip_,
                roof_material, roof_age_years, job_type, last_job_date, job_value,
                insurance_carrier, marketing_opt_in, created_at,
            )
        )
    return rows


def gen_tracking(rng, customer_ids_zips, fraction):
    """One tracking row per eligible (opted-in) customer, for a random subset."""
    rows = []
    thread_ids_seen = set()
    eligible = [c for c in customer_ids_zips if c[2]]  # marketing_opt_in
    sample_size = int(len(eligible) * fraction)
    sampled = rng.sample(eligible, sample_size)
    now = datetime.now(timezone.utc)

    for customer_id, zip_, _ in sampled:
        thread_id = secrets.token_hex(8)
        while thread_id in thread_ids_seen:
            thread_id = secrets.token_hex(8)
        thread_ids_seen.add(thread_id)

        storm_date = now - timedelta(days=rng.randint(1, 30))
        storm_context = json.dumps(
            {
                "zip": zip_,
                "hail_in": round(rng.uniform(0.5, 2.5), 2),
                "wind_mph": rng.randint(40, 90),
                "date": storm_date.date().isoformat(),
            }
        )

        status = weighted_choice(rng, TRACKING_STATUSES)
        created_at = storm_date + timedelta(hours=rng.randint(1, 12))

        # processed_message_count mirrors what Run B would have seen: still 1
        # (just the outbound send) if nothing came back yet, 2-3 if the
        # customer has replied at least once.
        if status in NO_REPLY_YET_STATUSES:
            processed_message_count = 1
        else:  # interested, not_interested, booked, unsubscribed
            processed_message_count = rng.choice([2, 2, 3])

        if status == "no_response":
            nudge_count = 1
            last_contacted_at = created_at + timedelta(days=rng.randint(8, 14))
        elif status == "awaiting_reply":
            nudge_count = rng.choice([0, 1])
            last_contacted_at = created_at + timedelta(days=rng.randint(0, 3))
        else:  # interested, not_interested, booked, unsubscribed
            nudge_count = rng.choice([0, 0, 1])
            last_contacted_at = created_at + timedelta(days=rng.randint(0, 6))

        rows.append(
            (customer_id, thread_id, storm_context, status, processed_message_count,
             nudge_count, last_contacted_at, created_at)
        )
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--customers", type=int, default=400)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--tracking-fraction", type=float, default=0.55,
                         help="Fraction of opted-in customers that get a tracking/lead row")
    parser.add_argument("--database-url", default=None, help="Overrides DATABASE_URL from .env")
    args = parser.parse_args()

    load_dotenv()
    database_url = args.database_url or os.environ["DATABASE_URL"]
    rng = random.Random(args.seed)

    customers = gen_customers(rng, args.customers)

    with psycopg.connect(database_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_PATH.read_text())

            cur.executemany(
                """
                INSERT INTO customers (
                    first_name, last_name, email, phone, street, city, state, zip,
                    roof_material, roof_age_years, last_job_type, last_job_date, last_job_value,
                    insurance_carrier, marketing_opt_in, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                customers,
            )

            cur.execute("SELECT customer_id, zip, marketing_opt_in FROM customers")
            customer_ids_zips = cur.fetchall()

            tracking_rows = gen_tracking(rng, customer_ids_zips, args.tracking_fraction)
            cur.executemany(
                """
                INSERT INTO tracking (
                    customer_id, thread_id, storm_context, status, processed_message_count,
                    nudge_count, last_contacted_at, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                tracking_rows,
            )
        conn.commit()

    zip_counts = Counter(row[7] for row in customers)
    opted_in = sum(1 for row in customers if row[14])
    status_counts = Counter(row[3] for row in tracking_rows)

    print(f"Inserted {len(customers)} customers, {len(tracking_rows)} tracking rows\n")
    print("Customers per zip:")
    for zip_, city, state in METROS:
        print(f"  {zip_} ({city}, {state}): {zip_counts.get(zip_, 0)}")
    print(f"\nOpted in: {opted_in} | Opted out: {len(customers) - opted_in}")
    print("\nTracking status breakdown:")
    for status, count in status_counts.most_common():
        print(f"  {status}: {count}")


if __name__ == "__main__":
    main()
