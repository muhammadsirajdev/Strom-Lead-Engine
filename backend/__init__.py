"""Read-only FastAPI service backing the StormLead operations dashboard.

Reads the same Postgres database the pipeline agents write to
(`customers`, `tracking`, `run_a_pending_review`, and LangGraph's
checkpoint tables). Every endpoint is read-only -- this package never
issues INSERT/UPDATE/DELETE/DDL, so it can safely point at production.
"""

__all__ = ["__version__"]

__version__ = "0.1.0"
