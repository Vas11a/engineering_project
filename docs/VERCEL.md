# Lexilo одним проектом Vercel

Frontend и backend собираются как два Vercel Services в одном проекте. Они используют общий домен, а PostgreSQL остаётся в Neon. Services доступен в Beta на всех планах Vercel, включая Hobby. [Документация Services](https://vercel.com/docs/services).

## Импорт репозитория

В Vercel импортируй `Vas11a/engineering_project`, ветку `main`:

| Настройка          | Значение                                                 |
| ------------------ | -------------------------------------------------------- |
| Root Directory     | `./` — корень репозитория                                |
| Application Preset | `Services`                                               |
| frontend root      | `frontend/`, framework `vite`                            |
| backend root       | `backend/`, framework `express`, entrypoint `src/app.ts` |

Используй конфигурацию из корневого `vercel.json`; не выбирай `Import single project`. Параметры сборки находятся внутри соответствующего сервиса. Backend экспортирует Express-приложение без запуска постоянного сервера или polling. Локальный `npm run dev` продолжает запускать обычный сервер.

## Маршруты и API

| Путь на общем домене | Обработчик                                  |
| -------------------- | ------------------------------------------- |
| `/api/(.*)`          | backend, включая `/api/v1/telegram/webhook` |
| `/health` и `/ready` | backend                                     |
| Остальные пути       | frontend                                    |

Порядок rewrites важен: API и health-маршруты стоят перед frontend. Vercel передаёт backend исходный путь целиком; дополнительный `/api` добавлять или удалять не нужно. [Маршрутизация Services](https://vercel.com/docs/services/routing).

Production frontend использует относительные `/api/v1/...` и `/health`. **Не задавай `VITE_API_URL` для этого варианта деплоя**, особенно значение `localhost`. Локальная разработка по умолчанию обращается к `http://localhost:3000`; явный `VITE_API_URL` предназначен для отдельного API-домена.

## Переменные Production

Задай переменные в Vercel для **Production**. Секретные значения хранятся как Secret. Не копируй production-пароли в Preview: для Preview используй отдельную тестовую базу и при необходимости отдельного бота.

| Переменная                | Значение                                                 |
| ------------------------- | -------------------------------------------------------- |
| `NODE_ENV`                | `production`                                             |
| `DEV_AUTH_ENABLED`        | `false`                                                  |
| `BOT_MODE`                | `webhook`                                                |
| `DATABASE_URL`            | Pooled-строка Neon, hostname с `-pooler`                 |
| `DATABASE_URL_UNPOOLED`   | Direct-строка той же базы и ветки Neon, без `-pooler`    |
| `TELEGRAM_BOT_TOKEN`      | Токен бота из BotFather                                  |
| `TELEGRAM_WEBHOOK_SECRET` | Случайные 16–256 символов: `A-Z`, `a-z`, `0-9`, `_`, `-` |
| `AI_API_KEY`              | Необязательно; включает AI-перевод                       |

Секрет webhook можно создать локально командой `openssl rand -hex 32`. Сохрани его одинаковым в Vercel и в окружении для `bot:setup`.

На Vercel backend автоматически определяет `MINI_APP_URL` и `PUBLIC_API_URL` по `VERCEL_PROJECT_PRODUCTION_URL`, с резервным `VERCEL_URL`. CORS по умолчанию использует текущий Vercel origin. Явно заданные значения имеют приоритет. Для стабильного домена можно задать:

```dotenv
MINI_APP_URL=https://your-project.vercel.app
PUBLIC_API_URL=https://your-project.vercel.app
CORS_ORIGIN=https://your-project.vercel.app
```

Не добавляй к этим значениям `/api`. Webhook setup сам добавляет `/api/v1/telegram/webhook`. Не помещай токены, пароли или строки базы в переменные с префиксом `VITE_`.

Vercel-окружение запрещает development-авторизацию и polling. Startup не регистрирует webhook автоматически: Preview-сборки не должны менять Production-бота.

## Миграции и выпуск

Vercel build генерирует Prisma Client и собирает приложения, но **не применяет миграции автоматически**. Перед выпуском, требующим новой схемы, примени закоммиченные миграции к нужной базе с direct-подключением:

```bash
cd backend
npm run db:deploy
```

Команда читает `DATABASE_URL_UNPOOLED` из текущего окружения или локального `backend/.env`. Проверь целевую базу перед запуском. Для этой версии должны быть применены `20261018100000_initial_schema` и `20261107100000_learning_sessions`.

После push в `main` Vercel собирает оба сервиса одним релизом. Проверь результат на публичном Production-домене:

1. `/` отдаёт интерфейс Lexilo и загружает его JS/CSS.
2. `/health` возвращает `200` и `status: ok`.
3. `/ready` возвращает `200` и `database: connected`.
4. `/api/v1/users/me` без Telegram-авторизации возвращает `401`.

Не отправляй вымышленные Telegram launch data для обхода проверки авторизации. Настоящий вход проверяется открытием приложения из бота.

## Подключение Telegram

Сначала дождись успешного Production-деплоя и проверки `/ready`. Затем:

1. Останови локальный backend с `BOT_MODE=polling`, чтобы он не конфликтовал с webhook.
2. В окружении для setup укажи тот же `TELEGRAM_BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET`, что в Vercel, а также `BOT_MODE=webhook`, явные `MINI_APP_URL` и `PUBLIC_API_URL` со стабильным Production-доменом. Локальный setup-скрипт не получает системные переменные Vercel автоматически.
3. Выполни из backend:

```bash
npm run bot:setup
```

Команда создаёт меню и регистрирует webhook с проверкой секретного заголовка. После смены домена или ротации секрета повтори setup. Не запускай локальный polling с этим токеном, пока используется Production-webhook.

Production-приложение и webhook должны быть доступны Telegram без входа в аккаунт Vercel. Проверь настройки Deployment Protection именно для Production. Защиту Preview сохраняй; приватные ресурсы приложения дополнительно защищены Telegram-авторизацией, а webhook — отдельным секретом.

## Проверка на устройстве

Напиши боту `/start`, открой приложение его кнопкой, создай набор и несколько карточек, заверши обучение и проверь статистику. Перезагрузи активную сессию и проверь восстановление. Опубликуй набор и скопируй его из второго Telegram-аккаунта. Если настроен AI-ключ, проверь получение, редактирование и подтверждение перевода.

| Симптом                               | Что проверить                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| Вместо JSON `/health` возвращает HTML | Rewrites направляют запрос в frontend вместо backend                                  |
| Frontend обращается к localhost       | Удали `VITE_API_URL` из Vercel и пересобери deployment                                |
| Backend не запускается                | Production-переменные, Prisma Client, секрет webhook, запрет polling/dev auth         |
| `/ready` отвечает `503`               | Строка базы, SSL, сетевой доступ и применённые миграции                               |
| Бот не отвечает                       | Setup, Production URL, одинаковый секрет, отсутствие polling, доступ без Vercel login |
| В браузере библиотека отвечает `401`  | Открой Mini App из Telegram; в Production это ожидаемо                                |

Раздельное размещение backend на Render и frontend на Vercel остаётся альтернативой: [DEPLOYMENT.md](DEPLOYMENT.md).
