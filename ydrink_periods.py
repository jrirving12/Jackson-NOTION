# ydrink_periods.py
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
from typing import Optional


CT = ZoneInfo("America/Chicago")


@dataclass(frozen=True)
class BiWeeklyPeriod:
    start: date
    end: date  # Saturday
    label: str


def most_recent_saturday(d: date) -> date:
    # Python weekday: Monday=0 ... Sunday=6, Saturday=5
    days_since_sat = (d.weekday() - 5) % 7
    return d - timedelta(days=days_since_sat)


def current_biweekly_period(now: Optional[datetime] = None) -> BiWeeklyPeriod:
    """
    Rolling bi-weekly window (14 days inclusive) that ends on Saturday.
    Uses America/Chicago time by default.
    """
    if now is None:
        now = datetime.now(CT)
    if now.tzinfo is None:
        now = now.replace(tzinfo=CT)

    end = most_recent_saturday(now.date())
    start = end - timedelta(days=13)
    label = f"{start.isoformat()}_to_{end.isoformat()}"
    return BiWeeklyPeriod(start=start, end=end, label=label)


def last_biweekly_period(current: BiWeeklyPeriod) -> BiWeeklyPeriod:
    """
    The bi-weekly period immediately before the current one.
    """
    end = current.end - timedelta(days=14)
    start = end - timedelta(days=13)
    label = f"{start.isoformat()}_to_{end.isoformat()}"
    return BiWeeklyPeriod(start=start, end=end, label=label)

def get_current_period():
    """
    Compatibility wrapper for ydrink_pull_playwright.py.
    Returns (start_date, end_date) as date objects.
    """
    p = current_biweekly_period()
    return (p.start, p.end)

