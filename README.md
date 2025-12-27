# AltF10 Kütüphanesi 🎮

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg) ![Electron](https://img.shields.io/badge/Electron-React-61DAFB.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg)

**AltF10 Kütüphanesi**, oyun kayıtlarını (DVR), klipleri ve ekran görüntülerini organize etmek, izlemek ve yönetmek için geliştirilmiş modern bir masaüstü uygulamasıdır. Özellikle **AV1** formatındaki yeni nesil kayıtları sorunsuz işlemek ve önizlemek için tasarlanmıştır.

## 🌟 Özellikler

* **🛡️ AV1 & DVR Desteği:** FFmpeg çökmelerine son! `ffmpeg-static` yerine tarayıcı tabanlı "Frontend Capture" teknolojisi ile en zorlu formatlarda bile %100 kararlı thumbnail (önizleme) oluşturma.
* **📂 Dinamik Kütüphane Yönetimi:** Video klasörünüzü program içinden seçebilir ve değiştirebilirsiniz.
* **⚡ Akıllı Önbellek (Cache) Sistemi:** Oluşturulan resimler kaydedilir, tekrar tekrar yüklenmez. Gerektiğinde tek tuşla temizlenebilir.
* **✏️ "Kilit Kıran" İsim Değiştirme:** Video arkada oynuyor olsa bile, sistem kaynaklarını otomatik serbest bırakarak "Dosya kullanımda" hatası almadan isim değiştirmenizi sağlar.
* **🎥 Gömülü Oynatıcı:** Tam ekran video oynatıcı, ses hafızası (volume memory) ve modern arayüz.
* **🖼️ Resim Görüntüleyici:** Sadece videoları değil, `.jpg` ve `.png` ekran görüntülerini de destekler.
* **🎨 Modern Arayüz:** Karanlık tema (Dark Mode), responsive grid yapısı ve şık animasyonlar.

## 🛠️ Kullanılan Teknolojiler

* **Electron:** Masaüstü kapsayıcısı ve dosya sistemi (FS) işlemleri.
* **React:** Kullanıcı arayüzü ve state yönetimi.
* **Node.js:** Arka uç lojiği.
* **HTML5 Canvas:** Video karelerini resme dönüştürmek için.
