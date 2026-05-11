from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from catboost import CatBoostRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "WholeBuilding_EnergyConsumptionDataSet.xlsx"
OUTPUT_DIR = ROOT / "outputs"
BEST_PARAMS_PATH = OUTPUT_DIR / "building_catboost_optuna_best.json"
OUTPUT_PATH = OUTPUT_DIR / "dt_timeseries_v1.json"
SHEET_NAME = "Hourly_Whole Bldg_ByCircuit"
TARGET_COL_RAW = "Hourly Electricity Use (Wh)"
EPS = 1e-9

CONTEXT_COLS = ["hour_of_day", "day_of_week", "month", "is_weekend"]

FLOOR1_LOADS = [
    "1st flr AHU",
    "1st flr HP ",
    "1st flr Lights",
    "1st flr Lobby recp",
    "1st flr Office #1 recp",
    "1st flr Office #2 recp",
    "1st flr Office #3 recp",
    "1st flr Bathroom",
    "1st flr Kitchen",
    "1st flr Copy Room recp",
    "1st flr Utility Room recp",
]

FLOOR2_LOADS = [
    "2nd flr AHU - Classroom ",
    "2nd flr AHU - Computer Room",
    "2nd flr HP - Classroom",
    "2nd flr HP - Computer Room",
    "2nd flr Office recp",
    "2nd flr Oven",
    "2nd flr Lights",
    "2nd flr Computer Room recp",
    "2nd flr Classroom #1 recp",
    "2nd flr Classroom #2 recp",
    "2nd flr Bathoom",
    "2nd flr Kitchen",
    "2nd flr Kitchen recp + Dishwasher",
    "2nd flr Water Cooler",
    "2nd flr Computer Room + Kitchen recp",
    "2nd flr Classroom #2 + Copy Room recp",
    "2nd flr Storage Room + Computer Room recp",
]

SHARED_LOADS = ["Refridgerator", "Exterior Lights", "ERV", "Water Heater"]
ALL_LOADS = FLOOR1_LOADS + FLOOR2_LOADS + SHARED_LOADS
FEATURE_COLS = ALL_LOADS + CONTEXT_COLS
TARGET_COL = "building_target_t_plus_1_kwh"

FIXED_ZONE_CONFIG_KWH = {
    "building": [1.0, 1.5, 2.0, 3.0],
    "floor1": [0.2, 0.3, 0.5, 1.2],
    "floor2": [0.35, 0.6, 0.9, 1.6],
}


def reconstruct_timestamp(date_series: pd.Series, time_series: pd.Series) -> pd.Series:
    def to_fractional_day(value: Any) -> float:
        if pd.isna(value):
            return np.nan
        if isinstance(value, (int, float, np.integer, np.floating)):
            return float(value) % 1.0
        if hasattr(value, "hour") and hasattr(value, "minute"):
            seconds = value.hour * 3600 + value.minute * 60 + getattr(value, "second", 0)
            seconds += getattr(value, "microsecond", 0) / 1_000_000
            return seconds / 86400.0
        parsed = pd.to_datetime(value, errors="coerce")
        if not pd.isna(parsed):
            seconds = parsed.hour * 3600 + parsed.minute * 60 + parsed.second
            seconds += parsed.microsecond / 1_000_000
            return seconds / 86400.0
        parsed_delta = pd.to_timedelta(str(value), errors="coerce")
        if not pd.isna(parsed_delta):
            return parsed_delta / pd.Timedelta(days=1)
        raise ValueError(f"Time value could not be parsed: {value!r}")

    fractional_days = time_series.map(to_fractional_day)
    return (pd.to_datetime(date_series) + pd.to_timedelta(fractional_days, unit="D")).dt.round("s")


def load_and_preprocess() -> pd.DataFrame:
    raw = pd.read_excel(DATA_PATH, sheet_name=SHEET_NAME)
    df = raw.dropna().copy()
    df["timestamp"] = reconstruct_timestamp(df["Date"], df["Time"])
    df = df.sort_values("timestamp").reset_index(drop=True)

    for col in ALL_LOADS + [TARGET_COL_RAW]:
        df[col] = pd.to_numeric(df[col], errors="raise") / 1000.0

    df = df.rename(columns={TARGET_COL_RAW: "building_target_t_kwh"})
    df["floor1_target_t_kwh"] = df[FLOOR1_LOADS].sum(axis=1)
    df["floor2_target_t_kwh"] = df[FLOOR2_LOADS].sum(axis=1)
    df["shared_target_t_kwh"] = df[SHARED_LOADS].sum(axis=1)
    df["hour_of_day"] = df["timestamp"].dt.hour.astype(int)
    df["day_of_week"] = df["timestamp"].dt.dayofweek.astype(int)
    df["month"] = df["timestamp"].dt.month.astype(int)
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df[TARGET_COL] = df["building_target_t_kwh"].shift(-1)
    return df.iloc[:-1].copy()


def chronological_split(df: pd.DataFrame, train_ratio: float = 0.70, val_ratio: float = 0.15):
    n = len(df)
    train_end = int(np.floor(n * train_ratio))
    val_end = int(np.floor(n * (train_ratio + val_ratio)))
    return df.iloc[:train_end].copy(), df.iloc[train_end:val_end].copy(), df.iloc[val_end:].copy()


def assign_zone(values: Any, thresholds: list[float]) -> np.ndarray:
    return np.digitize(np.asarray(values, dtype=float), thresholds, right=False) + 1


def zone_label(zone: int) -> str:
    return f"s{int(zone)}"


def lower_target_zone(zone: int) -> int:
    return max(1, int(zone) - 1)


def intervention_weight(feature_name: str) -> int:
    name = feature_name.lower()
    if "ahu" in name or "hp" in name or "erv" in name:
        return 3
    if "light" in name or "water heater" in name or "oven" in name:
        return 2
    return 1


FEATURE_WEIGHTS = {col: intervention_weight(col) for col in ALL_LOADS}
IMMUTABLE_LOADS = {"Refridgerator"}


def feature_floor(feature_name: str) -> str:
    if feature_name in FLOOR1_LOADS:
        return "floor1"
    if feature_name in FLOOR2_LOADS:
        return "floor2"
    return "shared"


def feature_category(feature_name: str) -> str:
    name = feature_name.lower()
    if "ahu" in name or "hp" in name or "erv" in name:
        return "hvac"
    if "light" in name:
        return "lighting"
    if "refridgerator" in name or "water heater" in name or "water cooler" in name or "oven" in name:
        return "appliance"
    if "recp" in name or "receptacle" in name:
        return "plug_load"
    if "kitchen" in name or "bath" in name:
        return "service_load"
    return "other"


def device_id(feature_name: str) -> str:
    cleaned = feature_name.strip().lower()
    for token in ["#", "+", "-", "(", ")", "/"]:
        cleaned = cleaned.replace(token, " ")
    return "_".join(cleaned.split())


def max_reduction_fraction_for_feature(feature_name: str, hour_of_day: int | None = None) -> float:
    name = feature_name.lower()
    if feature_name in IMMUTABLE_LOADS:
        return 0.0
    if "exterior lights" in name:
        if hour_of_day is not None and (hour_of_day >= 20 or hour_of_day <= 5):
            return 0.25
        return 0.70
    if "ahu" in name or "hp" in name or "erv" in name:
        return 0.30
    if "light" in name:
        return 0.50
    if "water heater" in name or "oven" in name:
        return 0.60
    return 0.80


def scene_position(feature_name: str, index_by_floor: dict[str, int]) -> dict[str, float]:
    floor = feature_floor(feature_name)
    idx = index_by_floor.get(floor, 0)
    index_by_floor[floor] = idx + 1
    y = 0.0 if floor in {"floor1", "shared"} else 1.25
    return {
        "x": round(float((idx % 6) * 1.4 - 3.5), 4),
        "y": round(float(y), 4),
        "z": round(float((idx // 6) * 1.2 - 1.8), 4),
    }


def build_device_catalog() -> list[dict[str, Any]]:
    index_by_floor = {"floor1": 0, "floor2": 0, "shared": 0}
    devices = []
    for feature in ALL_LOADS:
        devices.append(
            {
                "id": device_id(feature),
                "label": feature.strip(),
                "source_column": feature,
                "floor": feature_floor(feature),
                "category": feature_category(feature),
                "actionable": feature not in IMMUTABLE_LOADS,
                "immutable": feature in IMMUTABLE_LOADS,
                "comfort_weight": int(FEATURE_WEIGHTS[feature]),
                "scene": scene_position(feature, index_by_floor),
            }
        )
    return devices


def train_model(df: pd.DataFrame) -> tuple[CatBoostRegressor, dict[str, float]]:
    train_df, val_df, test_df = chronological_split(df)
    best = json.loads(BEST_PARAMS_PATH.read_text())
    params = best["best_params"]
    model = CatBoostRegressor(**params)
    fit_df = pd.concat([train_df, val_df], ignore_index=True)
    model.fit(fit_df[FEATURE_COLS], fit_df[TARGET_COL], verbose=False)

    test_pred = model.predict(test_df[FEATURE_COLS])
    metrics = {
        "MAE": float(mean_absolute_error(test_df[TARGET_COL], test_pred)),
        "RMSE": float(math.sqrt(mean_squared_error(test_df[TARGET_COL], test_pred))),
        "R2": float(r2_score(test_df[TARGET_COL], test_pred)),
        "zone_accuracy": float(
            np.mean(
                assign_zone(test_pred, FIXED_ZONE_CONFIG_KWH["building"])
                == assign_zone(test_df[TARGET_COL], FIXED_ZONE_CONFIG_KWH["building"])
            )
        ),
    }
    return model, metrics


def ace_stream_greedy(model: CatBoostRegressor, row: pd.Series, before_kwh: float, before_zone: int) -> dict[str, Any]:
    target_zone = lower_target_zone(before_zone)
    if before_zone <= 1:
        return {
            "method": "ACE_STREAM_GREEDY",
            "success": True,
            "before_kwh": round(float(before_kwh), 4),
            "after_kwh": round(float(before_kwh), 4),
            "before_zone": zone_label(before_zone),
            "after_zone": zone_label(before_zone),
            "target_zone": zone_label(target_zone),
            "delta_kwh": 0.0,
            "actions": [],
        }

    candidate = row.copy()
    previous_pred = before_kwh
    actions = []
    candidates = [
        col
        for col in ALL_LOADS
        if col not in IMMUTABLE_LOADS and float(row[col]) > EPS and max_reduction_fraction_for_feature(col, int(row["hour_of_day"])) > 0
    ]
    candidates = sorted(
        candidates,
        key=lambda col: (
            float(row[col]) * max_reduction_fraction_for_feature(col, int(row["hour_of_day"])),
            -FEATURE_WEIGHTS[col],
        ),
        reverse=True,
    )[:10]

    after_pred = before_kwh
    after_zone = before_zone
    for feature in candidates[:6]:
        cap = max_reduction_fraction_for_feature(feature, int(row["hour_of_day"]))
        before_value = float(candidate[feature])
        after_value = max(0.0, before_value * (1.0 - cap))
        if before_value - after_value <= EPS:
            continue
        candidate[feature] = after_value
        after_pred = float(model.predict(candidate[FEATURE_COLS].to_frame().T)[0])
        after_zone = int(assign_zone([after_pred], FIXED_ZONE_CONFIG_KWH["building"])[0])
        actions.append(
            {
                "feature": feature,
                "device_id": device_id(feature),
                "before_kwh": round(before_value, 4),
                "after_kwh": round(after_value, 4),
                "delta_kwh": round(before_value - after_value, 4),
                "reduction_fraction": round(float(cap), 4),
                "model_delta_kwh": round(max(0.0, previous_pred - after_pred), 4),
                "cost_weight": int(FEATURE_WEIGHTS[feature]),
                "cap_percent": int(round(cap * 100)),
                "category": feature_category(feature),
            }
        )
        previous_pred = after_pred
        if after_zone <= target_zone:
            break

    return {
        "method": "ACE_STREAM_GREEDY",
        "success": bool(after_zone <= target_zone),
        "before_kwh": round(float(before_kwh), 4),
        "after_kwh": round(float(after_pred), 4),
        "before_zone": zone_label(before_zone),
        "after_zone": zone_label(after_zone),
        "target_zone": zone_label(target_zone),
        "delta_kwh": round(max(0.0, before_kwh - after_pred), 4),
        "actions": actions,
    }


def build_frames(df: pd.DataFrame, model: CatBoostRegressor) -> list[dict[str, Any]]:
    predictions = model.predict(df[FEATURE_COLS])
    pred_zones = assign_zone(predictions, FIXED_ZONE_CONFIG_KWH["building"])
    frames = []
    for i, (_, row) in enumerate(df.iterrows()):
        before_pred = float(predictions[i])
        before_zone = int(pred_zones[i])
        recourse = ace_stream_greedy(model, row, before_pred, before_zone)
        values = [round(float(row[col]), 4) for col in ALL_LOADS]
        frames.append(
            {
                "i": i,
                "timestamp": pd.Timestamp(row["timestamp"]).isoformat(),
                "hour": int(row["hour_of_day"]),
                "day_of_week": int(row["day_of_week"]),
                "month": int(row["month"]),
                "current_total_kwh": round(float(row[ALL_LOADS].sum()), 4),
                "floor1_kwh": round(float(row[FLOOR1_LOADS].sum()), 4),
                "floor2_kwh": round(float(row[FLOOR2_LOADS].sum()), 4),
                "shared_kwh": round(float(row[SHARED_LOADS].sum()), 4),
                "predicted_t_plus_1_kwh": round(before_pred, 4),
                "predicted_zone": zone_label(before_zone),
                "target_zone": recourse["target_zone"],
                "observed_t_plus_1_kwh": round(float(row[TARGET_COL]), 4),
                "device_values": values,
                "recourse": recourse,
            }
        )
    return frames


def main() -> None:
    df = load_and_preprocess()
    model, metrics = train_model(df)
    frames = build_frames(df, model)
    payload = {
        "schema_version": "dt_timeseries_v1",
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "source": "WholeBuilding_EnergyConsumptionDataSet.xlsx",
        "unit": "kWh",
        "horizon": "H(t) -> H(t+1)",
        "zone_config_version": "v1_fixed_kwh",
        "zone_config": FIXED_ZONE_CONFIG_KWH,
        "model": {
            "name": "CatBoost_Optuna",
            "target": TARGET_COL,
            "metrics": {k: round(v, 6) for k, v in metrics.items()},
        },
        "feature_order": ALL_LOADS,
        "devices": build_device_catalog(),
        "frames": frames,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUTPUT_PATH}")
    print(f"frames={len(frames):,} devices={len(ALL_LOADS)} size_mb={OUTPUT_PATH.stat().st_size / 1_000_000:.2f}")


if __name__ == "__main__":
    main()
