# Final Digital Twin Dashboard

`dt_state_v1.json` kontratını kullanan bağımsız 3D Digital Twin dashboard.

## Pull and Deploy

Dashboard statik dosyalardan oluşur ve hazır JSON çıktılarıyla çalışır. Deploy ederken repo kökünü yayınlayın:

```bash
git clone https://github.com/akyilidizbaran/Smart-Building-Energy-Digital-Twin.git
cd Smart-Building-Energy-Digital-Twin
```

Kök `index.html` dosyası dashboard'a yönlendirir:

```text
/
```

Dashboard yolu:

```text
/dt_dashboard/
```

`dt_dashboard/` klasörünü tek başına deploy etmeyin. Dashboard şu dosyaları repo kökünden okur:

```text
outputs/dt_state_v1.json
outputs/dt_timeseries_v1.json
```

Sunucuda mevcut klonu güncellemek için:

```bash
git pull origin main
```

Ardından repo kökünü yeniden deploy edin.

## Lokal Önizleme

Deployment öncesi hızlı kontrol için proje kökünden:

```bash
python3 -m http.server 8765
```

```text
http://127.0.0.1:8765/dt_dashboard/
```

## Kapsam

- İki katlı 3D bina sahnesi.
- `dt_state_v1.devices` üzerinden cihaz kataloğu görselleştirmesi.
- `dt_state_v1.building` üzerinden bina tahmini ve zone durumu.
- `dt_state_v1.recourse.actions` üzerinden ACE recourse önerileri.
- `dt_timeseries_v1.frames` üzerinden saatlik playback akışı.
- Müdahale edilebilir cihazlar için manuel görsel önizleme.

## Notlar

- HTTP(S) üzerinden servis edin; doğrudan `file://` ile açmak JSON isteklerini engelleyebilir.
- Dashboard aksiyonları görsel olarak simüle eder; CatBoost modelini tarayıcıda yeniden çalıştırmaz.
- Saatlik ACE kartları `generate_timeseries.py` ile önceden üretilir; tarayıcı yalnızca kayıtlı durumları oynatır.
- FACE tanılama çıktısı `outputs/building_dt_recourse_results.csv` dosyasında bulunur.

## Saatlik Akışı Yeniden Üretme

```bash
python dt_dashboard/generate_timeseries.py
```
