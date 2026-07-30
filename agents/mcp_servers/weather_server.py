"""Custom MCP server exposing OpenWeather's current-weather endpoint as a tool.

Launched over stdio as a subprocess by `agents.runtime.mcp_client` (by path,
not as an import -- this module deliberately depends on nothing else in the
package). Run it standalone for a quick check:

    uv run python agents/mcp_servers/weather_server.py
"""

import os
from typing import Literal

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel

load_dotenv()

OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"

mcp = FastMCP("openweather")


class CurrentWeather(BaseModel):
    condition_code: int          # OpenWeather weather[0].id, e.g. 200-299 = thunderstorm
    conditions: str
    now: float
    high: float
    low: float
    pressure: int
    humidity: int
    feels_like: float
    wind_speed: float
    wind_deg: int
    sunrise: int
    sunset: int
    observed_at: int             # unix time the reading was taken (OpenWeather "dt")
    units: Literal["standard", "metric", "imperial"]


@mcp.tool()
async def get_current_weather(
    location: str,
    units: Literal["standard", "metric", "imperial"] = "metric",
) -> CurrentWeather:
    """Get current weather for a city name or zip/postal code via OpenWeather.

    location: a city name (e.g. "Lahore", "Paris,FR") or a zip/postal code (e.g. "10001")
    units: "standard" (Kelvin), "metric" (Celsius, m/s), or "imperial" (Fahrenheit, mph)
    """
    api_key = os.getenv("OPENWEATHER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENWEATHER_API_KEY is not set")

    location = location.strip()
    params = {
        "appid": api_key,
        "units": units,
        **({"zip": location} if location.isdigit() else {"q": location}),
    }
    async with httpx.AsyncClient(timeout=10) as http_client:
        response = await http_client.get(OPENWEATHER_URL, params=params)
        response.raise_for_status()
        data = response.json()

    return CurrentWeather(
        condition_code=data["weather"][0]["id"],
        conditions=data["weather"][0]["description"],
        now=data["main"]["temp"],
        high=data["main"]["temp_max"],
        low=data["main"]["temp_min"],
        pressure=data["main"]["pressure"],
        humidity=data["main"]["humidity"],
        feels_like=data["main"]["feels_like"],
        wind_speed=data["wind"]["speed"],
        wind_deg=data["wind"].get("deg", 0),
        sunrise=data["sys"]["sunrise"],
        sunset=data["sys"]["sunset"],
        observed_at=data["dt"],
        units=units,
    )


if __name__ == "__main__":
    mcp.run(transport="stdio")
