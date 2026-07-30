"""Pipeline-wide configuration shared across agents and the scheduler.

Per-stage constants stay with the stage that owns them -- Run A's
`WIND_THRESHOLD_MPH`, the maintenance job's `STALE_AFTER_DAYS`, Run C's
`SLACK_CHANNEL_NAME`. What lives here is settings more than one entry point
needs, so the scheduler in `backend/` never has to restate the pipeline's
own domain knowledge.
"""

from typing import Final

# Cities StormLead actively monitors -- must match the metros customers were
# seeded into (db/generate_data.py's METROS). Read by backend/scheduler.py
# for the unattended daily Run A pass; an interactive run passes its own
# cities on the command line instead.
SERVICE_CITIES: Final[list[str]] = [
    "Dallas",
    "Houston",
    "Austin",
    "San Antonio",
    "Denver",
    "Colorado Springs",
    "Tampa",
    "Orlando",
    "Miami",
    "Jacksonville",
]

__all__ = ["SERVICE_CITIES"]
