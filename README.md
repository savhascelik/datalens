# Data Lens AI

Tarayıcı içinde çalışan, dosya tabanlı yapay zekâ destekli veri analizi ürünü.

## Mevcut durum

- CSV, XLSX ve XLS yükleme; Excel sayfalarının ayrı tablolar olarak algılanması
- DuckDB-WASM worker içinde tablo oluşturma ve Parquet'e dönüştürme
- DuckDB worker ve WASM dosyaları Vite tarafından yerelden sunulur; CDN worker kullanılmaz
- DuckDB üzerinden sütun türü / boş değer / benzersizlik profili
- DuckDB sorgularıyla KPI ve kategori bazlı canlı grafik oluşturma
- Merkezi kategori filtresi ile dashboard sorgularının birlikte yenilenmesi
- Türkçe ve İngilizce arayüz; seçilen dil tarayıcıda saklanır
- Yapılandırılmış LLM dashboard planı istemcisi ve güvenli SQL çalıştırma katmanı
- İlk analiz istemi ve dashboard üretim arayüzü

## Sıradaki geliştirme

1. LLM API uç noktasını seçilen sağlayıcıyla sunucu tarafında bağlamak
2. Tarih/sayı temelli ek grafik türleri
3. Birden fazla filtre ile gelişmiş filtre bağlamı

Ürün yönü için [ürün pusulasına](outputs/URUN_PUSULASI.md) bakın.
