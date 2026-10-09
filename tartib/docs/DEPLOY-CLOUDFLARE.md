# Размещение на Cloudflare Workers

Сайт собирается адаптером OpenNext и работает как Cloudflare Worker. Размещение «smart» (`placement.mode` в `wrangler.jsonc`) переносит сервер ближе к базе Supabase. Принудительный регион `aws:eu-central-1` давал ошибки 503 при одновременных запросах, поэтому не используется.

## Выкладка

Нужен ключ Cloudflare с правом «Edit Cloudflare Workers» и ID аккаунта.

```bash
export CLOUDFLARE_API_TOKEN=...      # ключ
export CLOUDFLARE_ACCOUNT_ID=...     # ID аккаунта
npm ci
npm run cf:build
npm run cf:deploy
```

Все настройки сайта публичные и лежат в `wrangler.jsonc` (`vars`) и в скрипте `cf:build`. Секретов в репозитории нет.

## Домен

Домен привязывается как Custom Domain у Worker `tartib` (панель Cloudflare → Workers & Pages → tartib → Settings → Domains). Старый хостинг (Netlify) остаётся запасным вариантом: достаточно вернуть DNS-записи.

## Проверка

- 30–40 одновременных запросов к `/login` должны отвечать 200 без ошибок 503.
- Вход, запись сделки и переключение правил проверяются так же, как на Netlify.
