# Smart Building Energy Digital Twin

Akıllı bina enerji tüketimi için sızıntı kontrollü `H(t) -> H(t+1)` tahmin demosu. Proje, CatBoost tabanlı tahmin çıktısını ACE/FACE recourse analizleriyle birleştirir ve sonuçları statik bir 3D Digital Twin dashboard üzerinde gösterir.

## İçerik

- `Final.ipynb`: model eğitimi, benchmark, CatBoost optimizasyonu, recourse ve Digital Twin JSON üretim notebook'u.
- `WholeBuilding_EnergyConsumptionDataSet.xlsx`: kaynak akıllı bina enerji veri seti.
- `outputs/`: hazır model metrikleri, recourse çıktıları, cihaz kataloğu, `dt_state_v1.json` ve `dt_timeseries_v1.json`.
- `dt_dashboard/`: bağımsız çalışan 3D Digital Twin dashboard.
- `index.html`: proje kökünden dashboard'a yönlendirme sayfası.

## Hızlı Başlangıç

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m http.server 8765
```

Aç:

```text
http://127.0.0.1:8765/
```

Kök adres otomatik olarak dashboard'a yönlenir:

```text
http://127.0.0.1:8765/dt_dashboard/
```

## Saatlik Dashboard Akışını Yeniden Üretme

Dashboard hazır JSON çıktılarıyla gelir. Saatlik akışı yeniden üretmek için:

```bash
python dt_dashboard/generate_timeseries.py
```

Komut repo kökündeki `WholeBuilding_EnergyConsumptionDataSet.xlsx` dosyasını okur ve `outputs/dt_timeseries_v1.json` çıktısını günceller.

## Notlar

- Dashboard statiktir ve `outputs/` altındaki JSON dosyalarını okur.
- Tarayıcı tarafında CatBoost yeniden eğitilmez.
- `Refrigerator` recourse katmanında değiştirilemeyen yük olarak ele alınır.
- Geçerli sabit zone yapılandırması `v1_fixed_kwh`.
