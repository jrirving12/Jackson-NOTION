"""
ydrink_pull_playwright.py

EXECUTION MODE (locked context):
- Programmatically apply brand/category filters
- Call ajax=EstablishmentData
- Save ONE raw snapshot CSV per brand per run (Socorro, Soledad, Casa Lujo, Jalisco)
- Then run existing transformer

Notes:
- Jalisco MUST be pulled by CATEGORY (not brand) to get correct denominator.
- Period logic is already implemented in ydrink_periods.py.
- Playwright login + persistent profile is assumed working already.
"""

from __future__ import annotations
from datetime import date, timedelta
from zoneinfo import ZoneInfo

import csv
import os
import json
import re
import sys
import time
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Any, List, Tuple

from playwright.sync_api import sync_playwright, BrowserContext, Page, APIResponse

# --- Constants ---
YDRINK_BASE_URL = "https://data.ydrink.net"

# ---- Imports you already have in your repo (LOCKED) ----
# Assumes ydrink_periods.py provides the correct period window (14 days, ends Saturday).
try:
    from ydrink_periods import get_current_period  # type: ignore
except Exception as e:
    raise RuntimeError(
        "Could not import get_current_period from ydrink_periods.py. "
        "Ensure ydrink_periods.py exists and exports get_current_period()."
    ) from e


# =========================================================
# CONFIG YOU SET ONCE
# =========================================================

# Where raw snapshots are saved (LOCKED folder structure exists)
RAW_DIR = Path("ydrink_exports") / "raw"

# Persistent Playwright profile directory (so you stay logged in)
# If you already have one working, keep it and put its path here.
PERSISTENT_PROFILE_DIR = Path("ydrink_profile")

# Base URL of yDrink web app (set to what you already use)
YDRINK_BASE_URL = os.getenv("YDRINK_BASE_URL", "https://data.ydrink.net")

# Transformer script (already implemented/verified)
TRANSFORM_SCRIPT = Path("ydrink_transform_metrics.py")

# Optional: throttle between API pulls (helps avoid rate limits)
REQUEST_SLEEP_SECONDS = float(os.getenv("YDRINK_REQUEST_SLEEP_SECONDS", "0.5"))


# =========================================================
# FILTER DEFINITIONS (YOU MUST FILL THESE IDS ONCE)
# =========================================================
# Each brand has EXACTLY ONE category definition (category + subcategory + price tiers).
# This file needs the concrete filter payload/IDs that your earlier inspection discovered.
#
# IMPORTANT:
# - Socorro/Soledad/Casa Lujo: pull by BRAND filter
# - Jalisco: pull by CATEGORY filter (NOT brand)
#
# Put the correct IDs/values your app expects into the dicts below.
#
# Common patterns (examples only, you must match what yDrink expects):
#   brand_id, brand, brand_ids
#   category_id, category, category_ids
#   subcategory_id
#   price_tier_ids or price_tiers
#
# If your earlier deep inspection showed the exact request params for EstablishmentData,
# paste them into these dicts exactly.

from typing import Dict, Any, List

BRAND_FILTERS: Dict[str, Dict[str, Any]] = {
    "Socorro": {
        # Brand-based pull (Specific → search → select)
        "mode": "brand",

        # Brand search text (used in textbox)
        "brand_name": "Socorro",

        # Category modal selection
        "category": "TEQUILA",
        "subcategories": ["BLANCO", "REPOSADO", "ANEJO"],  # A/B/R
        "price_tiers": ["Premium", "Super"],
    },

    "Soledad": {
        "mode": "brand",
        "brand_name": "Soledad",

        "category": "TEQUILA",
        "subcategories": ["BLANCO", "MEZCAL"],
        "price_tiers": ["Super", "Luxury"],
    },

    "Casa Lujo": {
        "mode": "brand",
        "brand_name": "Casa Lujo",

        "category": "TEQUILA",
        "subcategories": ["BLANCO"],
        "price_tiers": ["Mid"],
    },

    "Jalisco": {
        # 🚨 HARD RULE: category-only pull (NO brand selection allowed)
        "mode": "category",

        "category": "LIQUEUR",
        "subcategories": ["TRIPLE SEC"],
        "price_tiers": ["Mid", "Premium"],
    },
}



# =========================================================
# INTERNALS
# =========================================================

@dataclass
class PeriodWindow:
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    period_label: str  # safe label for filenames


def _safe_slug(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")


def _ensure_dirs() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)


def _period_from_locked_logic() -> PeriodWindow:
    """
    Uses LOCKED period logic from ydrink_periods.py.
    get_current_period() must return (start_date, end_date) as date/datetime/strings.
    """
    start, end = get_current_period()

    # Normalize to YYYY-MM-DD strings
    def norm(d) -> str:
        if hasattr(d, "strftime"):
            return d.strftime("%Y-%m-%d")
        return str(d)

    start_s = norm(start)
    end_s = norm(end)
    label = f"{start_s}_to_{end_s}"
    return PeriodWindow(start_s, end_s, label)

def _locked_biweekly_window_chicago(today: date | None = None) -> tuple[date, date]:
    """
    Most recent Saturday on/before today (America/Chicago) is period_end.
    Period_start = period_end - 13 days (14 days inclusive).
    """
    if today is None:
        today = datetime.now(ZoneInfo("America/Chicago")).date()

    # Python weekday: Mon=0 ... Sat=5 ... Sun=6
    days_since_sat = (today.weekday() - 5) % 7
    period_end = today - timedelta(days=days_since_sat)
    period_start = period_end - timedelta(days=13)
    return period_start, period_end



def _open_logged_in_context(pw) -> Tuple[BrowserContext, Page]:
    """
    Uses persistent context so login stays cached.
    If your existing version already handles login, keep that behavior.
    """
    context = pw.chromium.launch_persistent_context(
        user_data_dir=str(PERSISTENT_PROFILE_DIR),
        headless=False,
    )
    page = context.new_page()
    return context, page


def _warm_up_session(page: Page) -> None:
    """
    Load a page that ensures cookies/session are active.
    Replace the path below with whatever you already use.
    """
    # Use a lightweight landing route you know is valid after login.
    page.goto(f"{YDRINK_BASE_URL}/index.php", wait_until="domcontentloaded", timeout=120_000)


def _call_establishment_data(page: Page) -> List[Dict[str, Any]]:
    """
    Calls EstablishmentData using current UI/session filter state.
    Returns parsed rows (endpoint returns JSON, not CSV).
    """
    url = f"{YDRINK_BASE_URL}/index.php?ajax=EstablishmentData&chain_group=false&corporate_group=false"
    resp: APIResponse = page.request.get(url, timeout=120_000, headers={"Accept": "application/json"})

    if not resp.ok:
        raise RuntimeError(
            f"EstablishmentData request failed: {resp.status} {resp.status_text}\nURL: {url}"
        )

    payload = resp.json()  # -> dict with keys like success/data

    if not isinstance(payload, dict) or not payload.get("success", False):
        raise RuntimeError(f"EstablishmentData unexpected payload: {str(payload)[:500]}")

    rows = payload.get("data", [])
    if not isinstance(rows, list):
        raise RuntimeError("EstablishmentData payload['data'] is not a list.")

    return rows

from io import BytesIO
import pandas as pd  # only if you already have it; if not, see note below
import openpyxl

def _call_establishment_export_rows(page: Page) -> List[Dict[str, Any]]:
    """
    Pulls the SAME dataset as the manual 'Export -> Excel' action.
    This export includes sgws_region (unlike ajax=EstablishmentData JSON).
    Returns rows as list[dict].
    """
    # NOTE: your captured URL had a double ?? — use a single ?
    url = (
        f"{YDRINK_BASE_URL}/index.php"
        "?report=EstablishmentData"
        "&export=excel"
        "&byYdk=true"
        "&chain_group=false"
        "&corporate_group=false"
    )

    resp: APIResponse = page.request.get(url, timeout=180_000)
    if not resp.ok:
        raise RuntimeError(f"Export request failed: {resp.status} {resp.status_text}\nURL: {url}")

    body = resp.body()  # bytes

    # --- Case 1: It's an XLSX file (most common). XLSX is a ZIP => starts with PK
    if body[:2] == b"PK":
        wb = openpyxl.load_workbook(BytesIO(body), data_only=True)
        ws = wb.active

        rows = list(ws.iter_rows(values_only=True))
        if not rows or len(rows) < 2:
            return []

        headers = [str(h).strip() if h is not None else "" for h in rows[0]]
        out: List[Dict[str, Any]] = []
        for r in rows[1:]:
            d = {}
            for i, h in enumerate(headers):
                if not h:
                    continue
                d[h] = r[i] if i < len(r) else None
            out.append(d)
        return out

    # --- Case 2: It's HTML (your Network tab shows text/html; often it's an HTML table Excel can open)
    text = resp.text()
    if "<table" in text.lower():
        # If you do NOT have pandas installed, tell me and I'll give a no-pandas HTML parser.
        dfs = pd.read_html(text)
        if not dfs:
            return []
        df = dfs[0]
        # Convert DataFrame to list of dict rows
        return df.to_dict(orient="records")

    # --- Case 3: Fallback — could be CSV/TSV-like text
    # We'll try comma, tab, semicolon.
    import csv
    import io

    for delim in [",", "\t", ";", "|"]:
        try:
            reader = csv.DictReader(io.StringIO(text), delimiter=delim)
            rows = list(reader)
            if rows and len(rows[0].keys()) > 3:
                return rows
        except Exception:
            pass

    raise RuntimeError("Export response was not recognized as XLSX, HTML table, or CSV/TSV.")



def _write_csv_snapshot(brand: str, period: PeriodWindow, rows: List[Dict[str, Any]]) -> Path:
    """
    Saves one raw snapshot CSV per brand per run.
    EstablishmentData returns JSON rows; we serialize to a proper CSV here.
    """
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    brand_slug = _safe_slug(brand)
    filename = f"establishmentdata__{brand_slug}__{period.period_label}__run_{ts}.csv"
    out_path = RAW_DIR / filename

    if not rows:
        out_path.write_text("", encoding="utf-8")
        return out_path

    fieldnames = sorted({k for r in rows for k in r.keys()})

    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    return out_path



def commit_search_state(page, *, search_type="Category", loc_type="All", value="", loc_value=""):
    url = (
        "https://data.ydrink.net/index.php"
        f"?ajax=search"
        f"&value={value}"
        f"&type={search_type}"
        f"&loc_value={loc_value}"
        f"&loc_type={loc_type}"
    )
    resp = page.request.get(url, timeout=30_000)
    if not resp.ok:
        raise RuntimeError(f"ajax=search failed: {resp.status} {resp.url}")

    # response is HTML fragment; just force it to complete
    _ = resp.text()

    # allow session/UI state to settle
    page.wait_for_timeout(750)

# --- DATE LOCKING (hard-lock yDrink session dates) ---

from datetime import date, timedelta
from zoneinfo import ZoneInfo

def _locked_biweekly_window_chicago(today: date | None = None) -> tuple[date, date]:
    """
    Most recent Saturday on/before today (America/Chicago) is period_end.
    Period_start = period_end - 13 days (14 days inclusive).
    """
    if today is None:
        today = datetime.now(ZoneInfo("America/Chicago")).date()

    # Mon=0 ... Sat=5 ... Sun=6
    days_since_sat = (today.weekday() - 5) % 7
    period_end = today - timedelta(days=days_since_sat)
    period_start = period_end - timedelta(days=13)
    return period_start, period_end


# ✅ STEP 1: DEFINE THIS DIRECTLY ABOVE _set_sales_and_compare_periods
def _change_setting(page: Page, setting_type: str, value: str) -> None:
    """
    Uses the same endpoint you captured in DevTools:
    /index.php?ajax=change_settings&type=...&value=YYYY-MM-DD
    """
    url = f"{YDRINK_BASE_URL}/index.php?ajax=change_settings&type={setting_type}&value={value}"
    resp: APIResponse = page.request.get(url, timeout=30_000)
    if not resp.ok:
        raise RuntimeError(f"change_settings failed: {resp.status} {resp.status_text} | {url}")


def _set_sales_and_compare_periods(page: Page, sales_start: date, sales_end: date) -> None:
    """
    Sets yDrink session date scope deterministically using ajax=change_settings.
    Compare period is the immediately preceding window of the same length.
    """
    compare_end = sales_start - timedelta(days=1)
    compare_start = compare_end - timedelta(days=13)

    _change_setting(page, "sales_period_start", sales_start.isoformat())
    _change_setting(page, "sales_period_end", sales_end.isoformat())
    _change_setting(page, "compare_period_start", compare_start.isoformat())
    _change_setting(page, "compare_period_end", compare_end.isoformat())

    # Optional: refresh the date display snippet (and helps the app settle)
    page.request.get(f"{YDRINK_BASE_URL}/index.php?ajax=update_date_display", timeout=30_000)
    page.wait_for_timeout(300)




def _run_transformer() -> None:
    """
    Runs existing transformer after raw snapshots are written.
    """
    if not TRANSFORM_SCRIPT.exists():
        raise RuntimeError(f"Transformer not found: {TRANSFORM_SCRIPT}")

    # Use the same python interpreter running this script.
    cmd = [sys.executable, str(TRANSFORM_SCRIPT)]
    completed = subprocess.run(cmd, capture_output=True, text=True)

    if completed.returncode != 0:
        raise RuntimeError(
            "Transformer failed.\n"
            f"STDOUT:\n{completed.stdout}\n\nSTDERR:\n{completed.stderr}"
        )


def _build_params_for_brand(
    brand: str,
    period: PeriodWindow,
    brand_filter_payload: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Central place to define EstablishmentData params.

    You MUST align keys here with what your yDrink web app expects.
    """
    params: Dict[str, Any] = {}

    # Locked period window
    params["start_date"] = period.start_date
    params["end_date"] = period.end_date

    # Add brand/category filter keys (from BRAND_FILTERS)
    # Example keys shown in BRAND_FILTERS comments.
    params.update(brand_filter_payload)

    # Optional: if you need to enforce region scope at pull-time, you can add it here:
    # params["sgws_region"] = ["North Texas", "Central Texas", "South Texas"]

    # Optional: if EstablishmentData needs paging controls:
    # params["page"] = 1
    # params["per_page"] = 5000

    return params

def open_filter_modal(page: Page) -> None:
    """
    Opens the Marketslice Category modal that contains Category/Subcategory/Price filters.
    Uses the known Bootstrap trigger data-target="#marketsliceCategoryModal".
    """
    modal = page.locator("#marketsliceCategoryModal")

    if modal.is_visible():
        return

    # Click the opener (there are two in your HTML: a button and a plus icon link)
    opener = page.locator('[data-target="#marketsliceCategoryModal"]').first
    opener.wait_for(state="visible", timeout=10_000)
    opener.click()

    modal.wait_for(state="visible", timeout=10_000)



def select_category(page: Page, category: str) -> None:
    open_filter_modal(page)
    modal = page.locator(".modal:visible").filter(has=page.locator("#intel-category-filter-save")).first
    modal.wait_for(state="visible", timeout=15_000)

    # The Category column is the first column in the modal body
    cat_col = modal.locator(".modal-body .col-xs-4").nth(0)

    target = category.strip().upper()

    # Deselect any active categories that are NOT the one we want
    # (Bootstrap list-group commonly marks selected items with .active)
    while True:
        active_items = cat_col.locator(".list-group-item.active")
        n = active_items.count()
        if n == 0:
            break

        changed = False
        for i in range(n):
            item = active_items.nth(i)
            txt = (item.inner_text() or "").strip().upper()
            if txt != target:
                item.click()
                page.wait_for_timeout(150)
                changed = True
                break
        if not changed:
            # Only the target remains active
            break

    # Ensure the target category is selected
    target_item = cat_col.locator(".list-group-item", has_text=category).first
    cls = (target_item.get_attribute("class") or "")
    if "active" not in cls:
        target_item.click()
        page.wait_for_timeout(200)

def reset_filters(page: Page) -> None:
    """
    Resets all active filters using the Reset button in the UI.
    This ensures each brand starts from a clean state.
    """
    reset_btn = page.locator("#reset")
    reset_btn.wait_for(state="visible", timeout=10_000)
    reset_btn.click()
    page.wait_for_timeout(500)

import re  # make sure re is imported at top

def open_category_filter_modal(page: Page):
    close_any_open_intel_modal(page)

    # open the intel modal via the + icon next to the dropdown
    opener = page.locator("#intel-category-filter-toggle").locator("xpath=..").first
    opener.scroll_into_view_if_needed()
    opener.click(force=True, timeout=10_000)

    # IMPORTANT: only the open modal has .in
    modal = page.locator("#intelCategoryModal.in").first
    modal.wait_for(state="visible", timeout=10_000)
    return modal





def _click_in_container(container, text: str) -> None:
    item = container.locator("a.list-group-item, a, .list-group-item", has_text=text).first
    item.scroll_into_view_if_needed()
    item.click(force=True, timeout=10_000)
    page_wait = container.page
    page_wait.wait_for_timeout(150)


def _col_by_header(modal, header_text: str):
    header = modal.locator("h4, h3", has_text=header_text).first
    header.wait_for(state="visible", timeout=10_000)
    return header.locator("xpath=..")




def _click_item(col, text: str):
    item = col.locator("a.list-group-item, .list-group-item, a", has_text=text).first
    item.wait_for(state="visible", timeout=10_000)
    item.scroll_into_view_if_needed()
    item.click(force=True, timeout=10_000)


def apply_category_filters(page: Page, category: str, subcategories: list[str], price_tiers: list[str]) -> None:
    set_search_mode_category(page)
    modal = open_category_filter_modal(page)

    # --- CATEGORY column is visible immediately ---
    cat_col = modal.locator("#container_intel_category")
    cat_col.wait_for(state="visible", timeout=10_000)

    # Click the category (TEQUILA / LIQUEUR) FIRST
    cat_item = cat_col.locator("a.list-group-item, a", has_text=category).first
    cat_item.wait_for(state="visible", timeout=10_000)
    cat_item.scroll_into_view_if_needed()
    cat_item.click(force=True, timeout=10_000)
    page.wait_for_timeout(250)

    # --- NOW Sub Category becomes visible (it was hidden before) ---
    sub_col = modal.locator("#container_intel_subcategory, #container_intel_sub_category, #container_intel_sub_category_text").first
    # Instead of relying on id variations, wait for the header to become visible within the OPEN modal
    modal.locator("h4, h3", has_text="Sub Category").first.wait_for(state="visible", timeout=10_000)

    # Click subcategories by text (scoped to the open modal)
    for sub in subcategories:
        sub_item = modal.locator("a.list-group-item, a", has_text=sub).first
        sub_item.wait_for(state="visible", timeout=10_000)
        sub_item.scroll_into_view_if_needed()
        sub_item.click(force=True, timeout=10_000)
        page.wait_for_timeout(150)

    # --- Price column should be visible as well ---
    modal.locator("h4, h3", has_text="Price (Avg Retail)").first.wait_for(state="visible", timeout=10_000)
    for tier in price_tiers:
        price_item = modal.locator("a.list-group-item, a", has_text=tier).first
        price_item.wait_for(state="visible", timeout=10_000)
        price_item.scroll_into_view_if_needed()
        price_item.click(force=True, timeout=10_000)
        page.wait_for_timeout(150)

    # SAVE is required
    save_btn = modal.locator("#intel-category-filter-save").first
    save_btn.wait_for(state="attached", timeout=10_000)
    save_btn.click(force=True, timeout=10_000)

    # Wait for modal to close (the .in class disappears)
    page.locator("#intelCategoryModal.in").wait_for(state="detached", timeout=10_000)
    page.wait_for_timeout(250)

def click_search(page: Page):
    page.locator("#search").click(timeout=10_000)
    page.wait_for_timeout(750)  # let session state update



def ensure_logged_in(page: Page) -> None:
    """
    Fully automates yDrink login when session expires.
    Handles both:
      - single-page login (email+password together)
      - two-step login (email -> Next -> password)
    Requires env vars: YDRINK_EMAIL, YDRINK_PASSWORD
    """
    email = os.getenv("YDRINK_EMAIL")
    password = os.getenv("YDRINK_PASSWORD")
    if not email or not password:
        print("⚠️ YDRINK_EMAIL / YDRINK_PASSWORD not set; cannot auto-login.")
        return

    # If we're already on the app and no password field is present, assume logged in.
    # (We still might be logged out via soft session, but we'll catch that on request retry.)
    if page.locator("input[type='password']").count() == 0 and "login" not in page.url.lower():
        return

    print("🔐 Login detected. Signing in...")

    # Ensure we're at a stable login surface
    page.wait_for_load_state("domcontentloaded", timeout=20_000)

    # Common selectors for email/user fields
    email_loc = page.locator(
        "input[type='email'], input[name='email'], input[name='username'], input[id*='email' i], input[id*='user' i]"
    )
    pw_loc = page.locator("input[type='password']")

    # --- Step 1: Fill email if field exists
    if email_loc.count() > 0:
        email_loc.first.click(force=True)
        email_loc.first.fill(email)
        page.wait_for_timeout(150)

        # If there is a Next/Continue button (two-step auth), click it.
        next_btn = page.locator(
            "button:has-text('Next'), button:has-text('Continue'), input[type='submit'][value*='Next' i]"
        )
        if next_btn.count() > 0 and pw_loc.count() == 0:
            next_btn.first.click(force=True)
            page.wait_for_timeout(300)

    # --- Step 2: Fill password (wait for it to appear)
    pw_loc = page.locator("input[type='password']")
    pw_loc.first.wait_for(state="visible", timeout=20_000)
    pw_loc.first.click(force=True)
    pw_loc.first.fill(password)
    page.wait_for_timeout(150)

    # --- Step 3: Submit
    submit_btn = page.locator(
        "button[type='submit'], input[type='submit'], button:has-text('Sign in'), button:has-text('Log in'), button:has-text('Login')"
    )
    if submit_btn.count() > 0:
        submit_btn.first.click(force=True)
    else:
        pw_loc.first.press("Enter")

    # --- Step 4: Confirm login by waiting for app home to load
    page.wait_for_load_state("domcontentloaded", timeout=30_000)
    page.wait_for_timeout(500)

    # If still seeing password field, login likely failed
    if page.locator("input[type='password']").count() > 0:
        raise RuntimeError("Login attempt finished but password field is still present (login may have failed).")

    print("✅ Logged in.")




def set_search_mode_category(page: Page) -> None:
    # Click the caret dropdown next to the "Brand" button
    page.locator(".search-brand-btn a.dropdown-toggle").first.click(timeout=10_000)
    # Choose "Category"
    page.locator("ul.dropdown-menu a.search-brand", has_text="Category").first.click(timeout=10_000)
    page.wait_for_timeout(250)

def close_any_open_intel_modal(page: Page) -> None:
    modal = page.locator("#intelCategoryModal")
    if modal.count() == 0:
        return

    if modal.is_visible():
        # 1) Try clicking the X button in the modal header (Bootstrap)
        close_btn = modal.locator("button.close, .modal-header button.close").first
        if close_btn.count() > 0:
            close_btn.click(force=True, timeout=5_000)
        else:
            # 2) Fallback: press Escape
            page.keyboard.press("Escape")

        # 3) Wait until modal is hidden (important)
        modal.wait_for(state="hidden", timeout=10_000)

        # tiny settle
        page.wait_for_timeout(200)




def main() -> None:
    _ensure_dirs()

    # Keep your existing period label logic if you want filenames consistent:
    period = _period_from_locked_logic()

    saved_files: List[Path] = []

    with sync_playwright() as pw:
        context, page = _open_logged_in_context(pw)
        try:
            _warm_up_session(page)

            # ✅ HARD-LOCK DATES ONCE PER RUN (session-level)
            sales_start, sales_end = _locked_biweekly_window_chicago()
            print(f"🗓️ Hard-locked dates: {sales_start} to {sales_end}")
            _set_sales_and_compare_periods(page, sales_start, sales_end)

            page.wait_for_timeout(500)

            for brand, payload in BRAND_FILTERS.items():
                if not payload:
                    raise RuntimeError(f"BRAND_FILTERS['{brand}'] is empty.")

                ensure_logged_in(page)

                reset_filters(page)

                apply_category_filters(
                    page,
                    category=payload["category"],
                    subcategories=payload["subcategories"],
                    price_tiers=payload["price_tiers"],
                )

                # commit the filter state (you already proved this matters)
                commit_search_state(page, search_type="Category", loc_type="All")

                # ✅ pull using your EXPORT function (the one that includes sgws_region)
                rows = None
                for attempt in range(2):
                    try:
                        ensure_logged_in(page)
                        rows = _call_establishment_export_rows(page)
                        break
                    except Exception as e:
                        if attempt == 0:
                            print("⚠️ Export failed; re-trying after re-login:", e)
                            page.goto(f"{YDRINK_BASE_URL}/index.php", wait_until="domcontentloaded")
                            continue
                        raise


                out_path = _write_csv_snapshot(brand, period, rows)
                saved_files.append(out_path)

                print(f"✅ Saved snapshot: {out_path}")
                time.sleep(REQUEST_SLEEP_SECONDS)

        finally:
            context.close()

    print("\n✅ Raw snapshots saved:")
    for p in saved_files:
        print(f" - {p}")


    print("ℹ️ Next step: re-enable transformer once pulls are stable.")



if __name__ == "__main__": main()



