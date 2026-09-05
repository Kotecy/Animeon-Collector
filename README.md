<p align="center">
  <img src="https://i.ibb.co/N6tTm6X4/logo.png" width="160" alt="Animeon Desktop">
</p>

<h1 align="center">Animeon Desktop</h1>

<p align="center">
  Неофициальный Windows-клиент для <a href="https://animeon.cc">Animeon</a> со вкладками, отдельными профилями и встроенными помощниками.
</p>

<p align="center">
  <a href="https://github.com/Kotecy/Animeon-Desktop/releases"><img src="https://img.shields.io/badge/version-0.3.14-violet" alt="version 0.3.14"></a>
  <img src="https://img.shields.io/badge/platform-Windows%2011-blue" alt="Windows 11">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license">
</p>

## Возможности

- До пяти вкладок Animeon с закреплением, отключением звука и прокруткой колесом мыши.
- До пяти независимых профилей с отдельными авторизованными сессиями.
- Детектор аномалий со звуком и уведомлением.
- Взаимная автоподписка на новых подписчиков.
- XP Monitor с автоматическим определением аккаунта, точными XP и уровнем.
- Каталог секреток с синхронизацией, фильтрами и инструкциями по наведению на `?`.
- Проверка новых версий через GitHub Releases.

## Временные инструменты
- NyaLogger ищущий коды NYA-*** формата.
- Декодер Морзе для задания на странице `/2501`.

## Скриншоты

| Главная | Полезные функции | Прогресс секреток | Настройки |
|---|---|---|---|
| <a href="https://i.ibb.co/WpjsNLSv/image.png"><img src="https://i.ibb.co/WpjsNLSv/image.png" width="200" alt="Главная"></a> | <a href="https://i.ibb.co/KpKc0fMG/image.png"><img src="https://i.ibb.co/KpKc0fMG/image.png" width="200" alt="Полезные функции"></a> | <a href="https://i.ibb.co/C500NX6c/image.png"><img src="https://i.ibb.co/C500NX6c/image.png" width="200" alt="Прогресс секреток"></a> | <a href="https://i.ibb.co/TBCfcDBd/image.png"><img src="https://i.ibb.co/TBCfcDBd/image.png" width="200" alt="Настройки"></a> |

## Установка

1. Скачайте `AnimeonDesktop.exe` на странице [Releases](https://github.com/Kotecy/Animeon-Desktop/releases).
2. Запустите файл — установка не требуется.

Настройки и сессии сохраняются в `%LOCALAPPDATA%\AnimeonDesktop`.

## Управление

- Колесо мыши над вкладками — горизонтальная прокрутка списка.
- Средняя кнопка мыши по вкладке — закрыть вкладку.
- `F5` — перезагрузить открытую страницу.
- `F12` — открыть или закрыть DevTools.
- Адресная строка принимает только `animeon.cc`, `animeon.co`, `v1.animeon.co` и `v2.animeon.co`.

<details>
<summary><b>Сборка из исходников</b></summary>

Требуются Node.js 20+ и npm.

```powershell
npm ci
npm run build
```

Portable-сборка появится в `release\AnimeonDesktop.exe`.

Для запуска среды разработки:

```powershell
npm run dev
```

</details>

## ⚠️ Дисклеймер

Animeon Desktop — неофициальный клиент и не связан с администрацией Animeon. Функции, выполняющие действия от имени аккаунта, используйте с учётом правил сайта.

## Лицензия

Проект распространяется по лицензии MIT.
