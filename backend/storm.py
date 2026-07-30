"""Normalization for `tracking.storm_context`, which has two real shapes.

Two different producers write this JSONB column, and they do not agree:

1. `agents/lead_find_agent.py` (`StormContext`, what a real pipeline run writes):
       {"city", "condition_text", "wind_mph", "date"}
2. `db/generate_data.py` (synthetic seed data):
       {"zip", "hail_in", "wind_mph", "date"}

Only `wind_mph` and `date` are common to both. The synthetic shape has no
`city` at all (it carries `zip`), and the real shape has no `hail_in`. So the
dashboard never trusts `storm_context.city` for grouping -- it joins through
`customers.city`, which is always present -- and treats every other field as
optional.

Severity mirrors `agents/lead_find_agent.py`'s own qualification rule so "severe" on
the dashboard means the same thing it means to the pipeline: a storm
condition, or wind at/over WIND_THRESHOLD_MPH.
"""

from typing import Any, Literal

# Kept in sync with lead_find_agent.WIND_THRESHOLD_MPH -- the wind speed at
# which that agent considers a city storm-affected enough to target.
WIND_THRESHOLD_MPH = 50.0

# Wind at/over this is noteworthy but below the agent's targeting threshold.
WIND_ELEVATED_MPH = 35.0

# Hail is only present in synthetic rows; ~1 inch is roughly the point where
# hail starts causing shingle damage.
HAIL_SEVERE_IN = 1.0

Severity = Literal["severe", "elevated", "calm", "unknown"]

# Substrings that indicate a genuinely stormy `condition_text`. OpenWeather's
# human-readable descriptions are lowercase phrases like "thunderstorm with
# heavy rain", "squall", "tornado".
_SEVERE_CONDITION_TERMS = (
    "thunderstorm",
    "tornado",
    "squall",
    "hail",
    "hurricane",
    "tropical storm",
)


def _coerce_float(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def classify_severity(condition_text: str | None, wind_mph: float | None, hail_in: float | None) -> Severity:
    """Grades one storm context. `severe` matches agents/lead_find_agent.py's own
    "this city qualifies for outreach" rule (storm condition OR wind >=
    threshold), extended with hail for synthetic rows.
    """
    text = (condition_text or "").lower()
    if any(term in text for term in _SEVERE_CONDITION_TERMS):
        return "severe"
    if wind_mph is not None and wind_mph >= WIND_THRESHOLD_MPH:
        return "severe"
    if hail_in is not None and hail_in >= HAIL_SEVERE_IN:
        return "severe"
    if wind_mph is not None and wind_mph >= WIND_ELEVATED_MPH:
        return "elevated"
    if condition_text or wind_mph is not None or hail_in is not None:
        return "calm"
    return "unknown"


def summarize(storm_context: Any) -> dict[str, Any]:
    """Flattens either storm_context shape into one predictable summary.

    Returns keys that are always present (so the frontend never branches on
    which producer wrote the row): condition_text, wind_mph, hail_in, date,
    zip, severity, label.
    """
    ctx: dict[str, Any] = storm_context if isinstance(storm_context, dict) else {}

    condition_text = ctx.get("condition_text") or ctx.get("conditions") or None
    if isinstance(condition_text, str):
        condition_text = condition_text.strip() or None

    wind_mph = _coerce_float(ctx.get("wind_mph"))
    hail_in = _coerce_float(ctx.get("hail_in"))

    date = ctx.get("date")
    date = date.strip() if isinstance(date, str) and date.strip() else None

    zip_code = ctx.get("zip")
    zip_code = str(zip_code).strip() if zip_code not in (None, "") else None

    severity = classify_severity(condition_text, wind_mph, hail_in)

    return {
        "condition_text": condition_text,
        "wind_mph": wind_mph,
        "hail_in": hail_in,
        "date": date,
        "zip": zip_code,
        "severity": severity,
        "label": build_label(condition_text, wind_mph, hail_in),
    }


def build_label(condition_text: str | None, wind_mph: float | None, hail_in: float | None) -> str | None:
    """One compact human string for a table cell, e.g.
    "Thunderstorm with heavy rain - 45 mph" or "1.8\" hail - 72 mph".
    Returns None when there's nothing to say, so the UI can show its own
    "no storm context" treatment instead of a placeholder string.
    """
    parts: list[str] = []

    if condition_text:
        parts.append(condition_text[0].upper() + condition_text[1:])
    if hail_in is not None:
        parts.append(f'{hail_in:g}" hail')
    if wind_mph is not None:
        parts.append(f"{wind_mph:g} mph wind" if not parts else f"{wind_mph:g} mph")

    return " · ".join(parts) if parts else None
