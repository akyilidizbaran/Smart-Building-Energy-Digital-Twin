# PROJECT_MEMORY

## 0) TL;DR

* Şu an ne yapıyoruz? Final Digital Twin demo projesi GitHub'a pushlanabilir temiz teslim klasörü olarak hazırlandı.
* Son değişiklik neydi? Gereksiz çalışma artefaktları dışarıda bırakıldı; dashboard, notebook, dataset ve gerekli JSON/CSV çıktıları korundu.
* Bir sonraki net adım ne? Repo klonlandıktan sonra `python3 -m http.server 8765` ile dashboard çalıştırılabilir.

## 1) Proje Amacı ve Kapsam

* Amaç: Akıllı bina enerji tüketimi için `H(t) -> H(t+1)` tahmini, ACE/FACE tarzı recourse çıktıları ve 3D Digital Twin görselleştirmesi.
* Kapsam içi: Final notebook, dataset, precomputed outputs ve standalone dashboard.
* Kapsam dışı: Eski 2242 raporları, AutoGluon ağır artefaktları, sanal ortamlar, cache/temp dosyaları.

## 2) Non-negotiables / Kırmızı Çizgiler

* Aynı-satır hedef sızıntısı kullanılmaz; tahmin hedefi `t+1` zamandır.
* Dashboard static JSON kontratı üzerinden çalışır.
* 3D DT dashboard root endpointten açılır; dosya listeleme gerektirmez.

## 3) Mimari Özet

* `Final.ipynb`: modelleme ve recourse üretim akışı.
* `dt_dashboard/`: HTML/CSS/JS tabanlı 3D Digital Twin arayüzü.
* `outputs/dt_state_v1.json`: dashboard başlangıç durumu.
* `outputs/dt_timeseries_v1.json`: saatlik playback akışı.
* `WholeBuilding_EnergyConsumptionDataSet.xlsx`: veri kaynağı.

## 4) Konvansiyonlar ve Standartlar

* Kod ve dashboard framework bağımsız tutuldu.
* Gereksiz üretilmiş artefaktlar repoya alınmaz.
* Büyük model klasörleri yerine notebook ve özet JSON/CSV çıktıları paylaşılır.

## 5) Kurulum & Çalıştırma

* Gereksinimler: Python 3.10+ önerilir.
* Kurulum: `pip install -r requirements.txt`
* Dashboard: `python3 -m http.server 8765`
* URL: `http://127.0.0.1:8765/`

## 6) Decision Log

* 2026-05-11 — Karar: GitHub teslim paketi `Ikok_Final` altında temiz repo olarak hazırlanacak | Gerekçe: Ana workspace 11GB ve birçok gereksiz runtime/rapor artefaktı içeriyor | Etki: Sadece Final DT için gerekli dosyalar repoya girecek | Alternatifler: Ana workspace'i direkt git repo yapmak.
* 2026-05-11 — Karar: Dataset repoya dahil edilecek | Gerekçe: Kullanıcı veri setinin yüklenebileceğini belirtti ve collaborator'ın direkt çalışabilmesi gerekiyor | Etki: `WholeBuilding_EnergyConsumptionDataSet.xlsx` repo root'ta bulunur | Alternatifler: Dataset'i GitHub dışında paylaşmak.

## 7) Milestones

* 2026-05-11 — Milestone: GitHub'a hazır temiz Final DT teslim klasörü oluşturuldu | Sonuç: Dashboard, notebook, dataset, outputs, README, requirements ve `.gitignore` hazır.

## 8) Yapılacaklar

* [ ] Collaborator repo'yu klonlayıp dashboard'u çalıştıracak.
* [ ] Gerekirse notebook'u kendi ortamında yeniden çalıştıracak.

## 9) Bilinen Riskler / Teknik Borç

* `dt_timeseries_v1.json` yaklaşık 28MB; GitHub limitini aşmıyor ama repo boyutunu artırıyor.
* Dashboard static JSON okur; canlı model skorlama için ayrıca backend gerekir.

