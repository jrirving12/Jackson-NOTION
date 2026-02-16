# ydrink_transform_metrics.py
from __future__ import annotations

import argparse
from pathlib import Path
import pandas as pd

EXPORTS_DIR = Path("./ydrink_exports")
RAW_DIR = EXPORTS_DIR / "raw"

# These are the minimum columns a raw snapshot CSV must have for us to compute the metrics truth table.
REQUIRED_COLS = [
    "account_id",
    "account_name",
    "sgws_region",
    "brand",
    "brand_cases",
    "category_cases",
    "brand_cases_lp",
    "category_cases_lp",
    "period_start",
    "period_end",
    "period_label",
    "pull_strategy",
    "run_timestamp",
]


def safe_div(numer: pd.Series, denom: pd.Series) -> pd.Series:
    denom2 = denom.replace({0: pd.NA})
    out = numer / denom2
    return out.fillna(0.0)


def load_raw_snapshots(paths: list[Path]) -> pd.DataFrame:
    """
    Load yDrink raw export snapshots and normalize them into the transformer schema.

    Export columns (as provided by yDrink):
      - cases, cases_lp, ms_category, ms_category_lp
      - establishment_id (or sometimes account/store id equivalent)

    Transformer schema (what compute_metrics expects):
      - brand_cases, brand_cases_lp, category_cases, category_cases_lp
      - account_id, brand, period_end
    """
    if not paths:
        raise ValueError("No raw snapshot paths provided.")

    frames: list[pd.DataFrame] = []

    for p in paths:
        df = pd.read_csv(p)

        # --- Normalize column names from export -> transformer schema
        rename_map = {
            "cases": "brand_cases",
            "cases_lp": "brand_cases_lp",
            "ms_category": "category_cases",
            "ms_category_lp": "category_cases_lp",
            "establishment_id": "account_id",
            "est_id": "account_id",  # fallback (older endpoint)
        }
        df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

        # --- Ensure account_id exists (required for unique_key + Notion upserts)
        if "account_id" not in df.columns:
            raise ValueError(
                f"{p.name} missing an account identifier column. "
                "Expected 'establishment_id' (preferred) or 'est_id'."
            )

        # --- Derive brand + period from filename (since the export itself may not include them)
        # Expected filename pattern:
        #   establishmentdata__<brand>__<period_label>__run_<timestamp>.csv
        parts = p.stem.split("__")
        if len(parts) >= 4 and parts[0].lower().startswith("establishmentdata"):
            brand = parts[1]
            period_label = parts[2]
        else:
            # If naming pattern changes, fail loudly (so we don't silently mis-tag data)
            raise ValueError(
                f"Unexpected raw snapshot filename format: {p.name}. "
                "Expected 'establishmentdata__<brand>__<period_label>__run_<ts>.csv'"
            )

        df["brand"] = brand
        df["period_label"] = period_label  # keep for debugging / lineage

        # Try to infer period_end from the period label if formatted like YYYY-MM-DD_to_YYYY-MM-DD
        period_end = None
        if "_to_" in period_label:
            try:
                period_end = period_label.split("_to_")[1]
            except Exception:
                period_end = None

        # You can overwrite this later from CLI if your script supplies a canonical period_end
        df["period_end"] = period_end

        # --- Validate required metric columns exist after renaming
        required_metric_cols = ["brand_cases", "category_cases", "brand_cases_lp", "category_cases_lp"]
        missing_metrics = [c for c in required_metric_cols if c not in df.columns]
        if missing_metrics:
            raise ValueError(f"{p.name} missing required metric columns after renaming: {missing_metrics}")

        frames.append(df)

    raw = pd.concat(frames, ignore_index=True)

    # --- Ensure numeric fields are numeric, blanks -> 0
    for c in ["brand_cases", "category_cases", "brand_cases_lp", "category_cases_lp"]:
        raw[c] = pd.to_numeric(raw[c], errors="coerce").fillna(0.0)

    # If period_end couldn't be inferred for some rows, fail loudly so period logic is explicit.
    if raw["period_end"].isna().any():
        # If you prefer to allow this and set period_end from CLI, remove this check.
        missing_n = int(raw["period_end"].isna().sum())
        raise ValueError(
            f"{missing_n} rows are missing period_end (could not infer from filename). "
            "Either ensure filenames contain '<start>_to_<end>' or set period_end from CLI."
        )

    return raw



def compute_metrics(raw: pd.DataFrame) -> pd.DataFrame:
    """
    Compute share, deltas, and business-facing performance metrics
    from raw yDrink fact data.

    True Difference definition:
        True Difference = brand_cases − (brand_cases_lp / category_cases_lp) × category_cases
    """
    df = raw.copy()

    # ------------------------------------------------------------------
    # Shares (current + last period)
    # ------------------------------------------------------------------
    df["share_of_category"] = safe_div(df["brand_cases"], df["category_cases"])
    df["share_of_category_lp"] = safe_div(df["brand_cases_lp"], df["category_cases_lp"])

    # ------------------------------------------------------------------
    # Volume deltas (absolute change)
    # ------------------------------------------------------------------
    df["delta_brand_cases"] = df["brand_cases"] - df["brand_cases_lp"]
    df["delta_category_cases"] = df["category_cases"] - df["category_cases_lp"]
    df["delta_share"] = df["share_of_category"] - df["share_of_category_lp"]

    # ------------------------------------------------------------------
    # Decomposition logic
    # ------------------------------------------------------------------
    # Expected brand cases if last-period share was maintained
    df["expected_cases_if_maintained_share"] = (
        df["category_cases"] * df["share_of_category_lp"]
    )

    # Share-driven gain / loss (this IS True Difference)
    df["share_gain_cases"] = (
        df["brand_cases"] - df["expected_cases_if_maintained_share"]
    )

    # ------------------------------------------------------------------
    # TRUE DIFFERENCE (business KPI)
    # ------------------------------------------------------------------
    df["true_difference_cases"] = df["share_gain_cases"]

    # Convenience splits for reporting / dashboards
    df["true_up_cases"] = df["true_difference_cases"].clip(lower=0)
    df["true_down_cases"] = df["true_difference_cases"].clip(upper=0)

    # ------------------------------------------------------------------
    # Category effect (diagnostic, not KPI)
    # ------------------------------------------------------------------
    df["category_effect_cases"] = (
        df["expected_cases_if_maintained_share"] - df["brand_cases_lp"]
    )

    # ------------------------------------------------------------------
    # Idempotent unique key (for Notion upserts)
    # ------------------------------------------------------------------
    df["unique_key"] = (
        df["account_id"].astype(str) + "|" +
        df["brand"].astype(str) + "|" +
        df["period_end"].astype(str)
    )

    # ------------------------------------------------------------------
    # Period flags
    # ------------------------------------------------------------------
    df["is_current_period"] = True
    df["is_last_period"] = False

    # ------------------------------------------------------------------
    # Baseline / opportunity placeholders (future phase)
    # ------------------------------------------------------------------
    df["baseline_brand_cases"] = pd.NA
    df["baseline_category_cases"] = pd.NA
    df["expected_share"] = pd.NA
    df["expected_cases"] = pd.NA
    df["gap_cases"] = pd.NA
    df["gap_cases_positive"] = pd.NA

    return df



def write_outputs(metrics: pd.DataFrame, period_end: str) -> Path:
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

    run_ts = str(metrics["run_timestamp"].max())
    out_path = EXPORTS_DIR / f"metrics_truth_{period_end}_{run_ts}.csv"
    metrics.to_csv(out_path, index=False)

    latest_path = EXPORTS_DIR / "metrics_truth_latest.csv"
    metrics.to_csv(latest_path, index=False)

    return out_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--period-end",
        required=True,
        help="YYYY-MM-DD (Saturday period end). Chooses which raw snapshot files to use.",
    )
    parser.add_argument(
        "--raw-dir",
        default=str(RAW_DIR),
        help="Directory containing raw snapshot CSVs (default: ydrink_exports/raw).",
    )
    parser.add_argument(
        "--mode",
        choices=["latest-per-brand", "all"],
        default="latest-per-brand",
    )
    args = parser.parse_args()

    period_end = args.period_end
    raw_dir = Path(args.raw_dir)

    # Find raw snapshots for this period_end
    candidates = sorted(raw_dir.glob(f"establishmentdata__*__*_to_{period_end}__run_*.csv"))
    if not candidates:
        raise FileNotFoundError(
            f"No raw snapshot CSVs found in {raw_dir} for period_end={period_end}."
        )

    if args.mode == "all":
        raw_files = candidates
    else:
        latest_by_brand: dict[str, Path] = {}
        for p in candidates:
            parts = p.name.split("__")
            if len(parts) < 4:
                continue
            brand = parts[1]
            if brand not in latest_by_brand or p.stat().st_mtime > latest_by_brand[brand].stat().st_mtime:
                latest_by_brand[brand] = p
        raw_files = sorted(latest_by_brand.values())

    print(f"📥 Using {len(raw_files)} raw snapshot file(s) for period_end={period_end}:")
    for p in raw_files:
        print(f" - {p.name}")

    # ---- Pipeline ----
    raw = load_raw_snapshots(raw_files)
    metrics = compute_metrics(raw)

    # Ensure run_timestamp exists for write_outputs()
    if "run_timestamp" not in metrics.columns:
        metrics["run_timestamp"] = pd.Timestamp.now()

    # Safety checks (KEEP)
    required_out_cols = ["unique_key", "brand", "period_end", "true_difference_cases"]
    missing_out = [c for c in required_out_cols if c not in metrics.columns]
    if missing_out:
        raise RuntimeError(f"Metrics output missing required columns: {missing_out}")

    out_path = write_outputs(metrics, period_end)

    print(f"✅ Wrote: {out_path}")
    print(f"✅ Wrote: {EXPORTS_DIR / 'metrics_truth_latest.csv'}")

 


if __name__ == "__main__":
    main()





