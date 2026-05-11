# Ikok Final Digital Twin

Leakage-safe smart building Digital Twin demo for one-step-ahead energy prediction and ACE/FACE-style recourse visualization.

## Contents

- `Final.ipynb`: model training, benchmark, CatBoost tuning, recourse and DT JSON generation notebook.
- `WholeBuilding_EnergyConsumptionDataSet.xlsx`: source building energy dataset.
- `outputs/`: precomputed model metrics, recourse outputs, device catalog, `dt_state_v1.json` and `dt_timeseries_v1.json`.
- `dt_dashboard/`: standalone 3D Digital Twin dashboard.
- `index.html`: root redirect to the dashboard.

## Quick Start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m http.server 8765
```

Open:

```text
http://127.0.0.1:8765/
```

The root endpoint redirects to:

```text
http://127.0.0.1:8765/dt_dashboard/
```

## Regenerate Dashboard Time Series

The dashboard already includes precomputed JSON outputs. To regenerate the hourly stream:

```bash
python dt_dashboard/generate_timeseries.py
```

This reads `WholeBuilding_EnergyConsumptionDataSet.xlsx` from the repo root and writes `outputs/dt_timeseries_v1.json`.

## Notes

- The dashboard is static and reads JSON files from `outputs/`.
- Browser-side code does not retrain CatBoost.
- `Refridgerator` is treated as immutable in the recourse layer.
- The current fixed zone configuration is `v1_fixed_kwh`.

