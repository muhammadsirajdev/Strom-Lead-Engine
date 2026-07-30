"""The `tracking.status` lifecycle, as the pipeline actually defines it.

Mirrors the CHECK constraint in `db/schema.sql` and the terminal/non-terminal
split that `agents/send_booking_agent.py` polls on. Kept in one place so the funnel
maths and the pipeline board can't drift apart.
"""

from typing import Final

# Order matters: this is the order the board and the status breakdown render in.
STATUSES: Final[tuple[str, ...]] = (
    "awaiting_reply",
    "interested",
    "booked",
    "not_interested",
    "no_response",
    "unsubscribed",
)

# agents/send_booking_agent.py keeps polling a thread in a non-terminal status (so a
# change-of-mind reply after "not interested" is still picked up) and stops
# once it reaches a terminal one.
NON_TERMINAL: Final[frozenset[str]] = frozenset({"awaiting_reply", "interested", "not_interested"})
TERMINAL: Final[frozenset[str]] = frozenset({"booked", "no_response", "unsubscribed"})

# A reply was received iff triage moved the row off awaiting_reply. `booked`
# implies a reply too (triage had to classify it interested first).
REPLIED: Final[frozenset[str]] = frozenset({"interested", "not_interested", "booked", "unsubscribed"})

# Statuses that represent a positive intent signal at some point.
INTERESTED_OR_BEYOND: Final[frozenset[str]] = frozenset({"interested", "booked"})


def is_terminal(status: str) -> bool:
    return status in TERMINAL
