# Okey 101 AI

React ve TypeScript ile geliştirilmiş, modern, hızlı ve yapay zekaya karşı oynanabilen tam teşekküllü bir **101 Okey** web uygulaması.

## Özellikler

- **Gelişmiş Oyun Kuralları**: Orijinal 101 Okey kurallarının neredeyse tamamı desteklenmektedir:
  - Per (seri/grup) açma ve çift açma (min. 5 çift)
  - Yere açılmış perlere / çiftlere taş işleme (kendi elinize veya rakiplerin açtığı taşlara)
  - Yerdeki sahte okeyi / okeyi kendi taşıyla değiştirme
  - Elden bitme, Okey ile bitme mekanikleri (katlamalı ceza / puan sistemleri ile)
  - Katlamalı ve Katlamasız oyun modları
  - İşlek taş atma cezası ve diğer ceza durumları
- **Yapay Zeka (AI)**: Akıllı algoritmalar ile donatılmış 3 adet bot rakibe karşı oynama imkanı. Botlar elindeki taşları dizebilir, per/çift açabilir, bitmek için strateji kurabilir ve yere taş işleyebilir.
- **Modern ve Akıcı Arayüz**: Tailwind CSS kullanılarak karanlık tema (Dark Mode) odaklı, pürüzsüz animasyonlar ve şık bir deneyim sunulmaktadır.
- **Sürükle ve Bırak (Drag & Drop)**: Doğal bir oyun deneyimi için taşları sürükleyerek istifleme, yere açma, işleme veya atma ([@dnd-kit/core](https://dnd-kit.com/) ile güçlendirildi).
- **Gerçek Zamanlı İstatistikler**: Kazandı / Kaybetti istatistikleri ve oynanan ellerin sonuç tablosu.

## Kurulum ve Çalıştırma

Projeyi yerel ortamınızda çalıştırmak için aşağıdaki adımları izleyin:

### Gereksinimler
- **Node.js** (v18 veya üzeri önerilir)
- **npm** (veya yarn / pnpm)

### Adımlar

1. **Bağımlılıkları yükleyin**:
   ```bash
   npm install
   ```

2. **Geliştirme sunucusunu başlatın**:
   ```bash
   npm run dev
   ```

3. **Tarayıcıda açın**:  
   Uygulama, varsayılan olarak `http://localhost:3000` (veya Vite'ın atadığı bir port üzerinde) adresinden izlenebilir.

### Üretim (Production) Derlemesi
Projeyi canlı ortama hazırlamak için:
```bash
npm run build
```
Oluşturulan statik dosyalar `dist/` klasörüne aktarılır. `npm run preview` ile bu derlemeyi test edebilirsiniz.

## Teknolojiler / Araçlar

- **Vite**: Hızlı ve modern frontend derleyici.
- **React (v18)**: Kullanıcı arayüzü kütüphanesi.
- **TypeScript**: Güvenli kod ve tip denetimi.
- **Tailwind CSS**: Çevik ve özelleştirilebilir CSS utility framework'ü.
- **@dnd-kit/core**: Performanslı ve erişilebilir sürükle-bırak (Drag & Drop) kütüphanesi.
- **lucide-react**: Modern ve hafif ikon setleri.

## Kurallar ve Puanlama

- **Bitme Durumları**:
  - Deste bittiği halde kimse açmamışsa herkes puan cezası alır.
  - Normal bitiş: Rakipler açtıkları ve ellerinde kalan taşlara göre eksi ceza veya puan yerler (-101 kazanan, kalan ellere göre çarpılarak hesaplanır).
  - Okey elden, Elden bitme ve Çift açanın bitmesi gibi özel durumlar çarpanlı puanlamaya (2 katı veya 4 katı) tabidir.
- **Cezalar**:
  - Yere taş atarken kendi işler taşınızı atarsanız ceza yersiniz (Elden bitme sırasında hariç).
  - Taşı yerden çekerseniz aynı turda el açmak veya eliniz önceden açıksa elinizdeki bir taşı işlemek zorundasınız; aksi halde desteden çekmelisiniz.

## Lisans
Bu proje açık kaynaklıdır ve MIT lisansı ile dağıtılmaktadır. Kodları inceleyebilir, geliştirebilir veya kendi sunucunuzda barındırabilirsiniz.
