# Размещение на Cloudflare Workers

Сайт собирается адаптером OpenNext и работает как Cloudflare Worker. Сервер сайта ставится во Франкфурт (`placement.region` в `wrangler.jsonc`), рядом с базой Supabase.

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

- `curl -I https://<адрес>/login` должен вернуть заголовок `cf-placement: remote-FRA`.
- Вход, запись сделки и переключение правил проверяются так же, как на Netlify.
