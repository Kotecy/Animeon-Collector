<p align="center">
  <img src="https://i.ibb.co/N6tTm6X4/logo.png" width="160" alt="Animeon Desktop">
</p>

<h1 align="center">Animeon Desktop</h1>

<p align="center">
  Десктоп-клиент для <a href="https://animeon.cc">Animeon</a> на Electron:<br>
  сайт во встроенных вкладках, мультипрофили, детектор аномалий и взаимная автоподписка.
</p>

<p align="center">
  <a href="https://github.com/Kotecy/Animeon-Desktop/releases"><img src="https://img.shields.io/badge/version-0.3.0-violet" alt="version"></a>
  <img src="https://img.shields.io/badge/platform-Win%2011-blue" alt="platform">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
</p>

## ✨ Возможности

- 🗂️ **Вкладки сайта** — до 5 фоновых вкладок, закрепление, мьют, индикатор звука.
- 👥 **Профили** — до 5 изолированных сессий, переключение на лету, перенос сессии при смене домена (v1–v4).
- 📡 **Детектор аномалий** — замечает аномалию и зовёт тройным звуком, всплывающим окном.
- 🤝 **Взаимная автоподписка** — подписывается в ответ на новых фолловеров.
- 🏆 **Секреты** — каталог секретных достижений с прогрессом.
- 🔄 **Обновления** — проверка новых версий через GitHub Releases из настроек.

## 🖼️ Скриншоты

| Главная | Полезные функции | Прогресс секреток | Настройки |
|---|---|---|---|
| <a href="https://i.ibb.co/WpjsNLSv/image.png"><img src="https://i.ibb.co/WpjsNLSv/image.png" width="200" alt="Главная"></a> | <a href="https://i.ibb.co/KpKc0fMG/image.png"><img src="https://i.ibb.co/KpKc0fMG/image.png" width="200" alt="Полезные функции"></a> | <a href="https://i.ibb.co/C500NX6c/image.png"><img src="https://i.ibb.co/C500NX6c/image.png" width="200" alt="Прогресс секреток"></a> | <a href="https://i.ibb.co/TBCfcDBd/image.png"><img src="https://i.ibb.co/TBCfcDBd/image.png" width="200" alt="Настройки"></a> |

## 📦 Установка

1. Скачай `AnimeonDesktop.exe` из [Releases](https://github.com/Kotecy/Animeon-Desktop/releases).
2. Запусти — установка не нужна (portable). Данные хранятся в `%LOCALAPPDATA%\AnimeonDesktop`.

<details>
<summary><b>Сборка из исходников</b></summary>

```cmd
npm install
npm run build
npx electron-builder --win portable --publish never
```

Готовый файл: `release\AnimeonDesktop.exe`.

</details>

## ⚠️ Дисклеймер

Неофициальный клиент. Автоматизация действий аккаунта может нарушать правила AnimeOn — используешь на свой риск. Детектор аномалий страницу не трогает (только наблюдает и уведомляет).

## 📄 Лицензия

MIT — см. [LICENSE](https://github.com/Kotecy/Animeon-Desktop/blob/main/LICENSE).
