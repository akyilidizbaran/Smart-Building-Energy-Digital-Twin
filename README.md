# Smart Building Energy Digital Twin

Akıllı bina enerji tüketimi için sızıntı kontrollü `H(t) -> H(t+1)` tahmin demosu. Proje, CatBoost tabanlı tahmin çıktısını ACE/FACE recourse analizleriyle birleştirir ve sonuçları statik bir 3D Digital Twin dashboard üzerinde gösterir.

## İçerik

- `Final.ipynb`: model eğitimi, benchmark, CatBoost optimizasyonu, recourse ve Digital Twin JSON üretim notebook'u.
- `WholeBuilding_EnergyConsumptionDataSet.xlsx`: kaynak akıllı bina enerji veri seti.
- `outputs/`: hazır model metrikleri, recourse çıktıları, cihaz kataloğu, `dt_state_v1.json` ve `dt_timeseries_v1.json`.
- `dt_dashboard/`: bağımsız çalışan 3D Digital Twin dashboard.
- `index.html`: proje kökünden dashboard'a yönlendirme sayfası.

## Pull and Deploy

```bash
git clone https://github.com/akyilidizbaran/Smart-Building-Energy-Digital-Twin.git
cd Smart-Building-Energy-Digital-Twin
```

Statik hosting sağlayıcısında deploy kaynağı olarak repo kökünü seçin. Kök `index.html` dosyası dashboard'a yönlendirir:

```text
/
```

Dashboard yolu:

```text
/dt_dashboard/
```

Dashboard hazır JSON çıktılarıyla çalışır; deploy için Python ortamı veya notebook çalıştırma gerekmez. `dt_dashboard/` klasörünü tek başına deploy etmeyin, çünkü arayüz `outputs/dt_state_v1.json` ve `outputs/dt_timeseries_v1.json` dosyalarını repo kökünden okur.

Sunucuda mevcut bir klon varsa güncelleme için:

```bash
git pull origin main
```

Ardından aynı repo kökünü yeniden deploy edin.

## Lokal Önizleme

Deployment öncesi hızlı kontrol için repo kökünden statik HTTP server açılabilir:

```bash
python3 -m http.server 8765
```

```text
http://127.0.0.1:8765/
```

## Saatlik Dashboard Akışını Yeniden Üretme

Bu adım sadece `outputs/dt_timeseries_v1.json` çıktısını yeniden üretmek isteyenler içindir. Gerekli Python paketlerini kurduktan sonra:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Saatlik akışı üretmek için:

```bash
python dt_dashboard/generate_timeseries.py
```

Komut repo kökündeki `WholeBuilding_EnergyConsumptionDataSet.xlsx` dosyasını okur ve `outputs/dt_timeseries_v1.json` çıktısını günceller.

## Notlar

- Dashboard statiktir ve `outputs/` altındaki JSON dosyalarını okur.
- Tarayıcı tarafında CatBoost yeniden eğitilmez.
- `Refrigerator` recourse katmanında değiştirilemeyen yük olarak ele alınır.
- Geçerli sabit zone yapılandırması `v1_fixed_kwh`.
