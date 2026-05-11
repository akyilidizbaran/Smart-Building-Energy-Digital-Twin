# Final Digital Twin Dashboard

Standalone 3D/scene-based visualization for the frozen `dt_state_v1.json` contract.

## Run

From the project root:

```bash
cd Final
python3 -m http.server 8765
```

Open:

```text
http://127.0.0.1:8765/dt_dashboard/
```

The dashboard reads:

```text
Final/outputs/dt_state_v1.json
Final/outputs/dt_timeseries_v1.json
```

## Scope

- Two-floor 3D building scene.
- Device catalog visualization from `dt_state_v1.devices`.
- Building prediction and zone status from `dt_state_v1.building`.
- ACE recourse actions from `dt_state_v1.recourse.actions`.
- Hour-by-hour playback from `dt_timeseries_v1.frames`.
- Manual override visual preview for actionable devices.

## Notes

- Use a local HTTP server; direct `file://` opening can block JSON fetch.
- The current dashboard simulates actions visually. It does not re-run the CatBoost model in browser.
- The streaming ACE cards are precomputed by `generate_timeseries.py`; the browser only plays and applies stored states.
- FACE diagnostic remains available in `Final/outputs/building_dt_recourse_results.csv`.

## Regenerate Hourly Stream

```bash
.venv39/bin/python Final/dt_dashboard/generate_timeseries.py
```
