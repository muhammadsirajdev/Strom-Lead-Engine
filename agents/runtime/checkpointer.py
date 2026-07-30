"""The Postgres checkpointer every StormLead graph is compiled against.

One shared `AsyncPostgresSaver` over the same database the pipeline's
`customers`/`tracking` tables live in. It's what makes Run A's human-review
`interrupt` survivable: the paused graph's state (including the drafts
awaiting review) is written to the `checkpoints`/`checkpoint_blobs` tables, so
a later `--review` pass -- or the dashboard's read-only review queue -- can
pick the thread back up in a different process.
"""

import os

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

# `from_conn_string`'s context manager must be kept alive for the life of the
# process (see build_checkpointer) -- module-level so it outlives the
# function call that creates it instead of being garbage-collected, which
# would silently close the connection out from under the checkpointer.
_checkpointer_cms: list = []


async def build_checkpointer() -> AsyncPostgresSaver:
    """Opens the Postgres checkpointer used by every LangGraph graph in this
    pipeline. `AsyncPostgresSaver` is an async context manager; it's entered
    manually (rather than `async with`) so the connection stays open for the
    life of the process instead of closing at the end of a `with` block.
    """
    checkpointer_cm = AsyncPostgresSaver.from_conn_string(os.environ["DATABASE_URL"])
    checkpointer = await checkpointer_cm.__aenter__()
    _checkpointer_cms.append(checkpointer_cm)  # prevents GC from closing the connection
    await checkpointer.setup()
    return checkpointer
