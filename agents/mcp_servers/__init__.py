"""MCP servers this project implements itself.

Currently just `weather_server`, a stdio server wrapping OpenWeather's
current-weather endpoint. It is launched as a subprocess (by path, not as an
import) from `agents.runtime.mcp_client`, so it deliberately depends on
nothing else in this package -- see WEATHER_MCP_SERVER there.

Third-party MCP servers the pipeline consumes (Klavis' Gmail and Slack,
Composio's Calendly Tool Router) are hosted elsewhere and only configured in
`agents.runtime.mcp_client`.
"""
