# Launchpad

Собственный аналог Railway: вы указываете образ или Git-репозиторий, а платформа
запускает сервис на одном из ваших серверов, держит его живым и отдаёт по домену.

## Что уже работает

- **Control plane** (`cmd/lp-controlplane`): API, хранение состояния, планировщик.
- **Agent** (`cmd/lp-agent`): ставится на каждый сервер, запускает контейнеры через Docker.
- **Edge** (`cmd/lp-edge`): принимает трафик и направляет его по домену на нужный сервер.
- Деплой из Docker-образа или из Git (нужен `Dockerfile` в репозитории).
- Переменные окружения, редеплой, удаление.
- Если сервер перестал отвечать, сервисы переезжают на другой.

Не реализовано: HTTPS (ставьте Caddy перед edge), панель, логи, тома, базы данных
как шаблоны, пользователи и биллинг. Порядок работ описан в
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Запуск

```bash
go build -o bin/ ./cmd/...

export LP_API_TOKEN=$(openssl rand -hex 24)   # для вас (API)
export LP_NODE_TOKEN=$(openssl rand -hex 24)  # для агентов и edge

# 1. Control plane
./bin/lp-controlplane --domain apps.example.com

# 2. На каждом сервере с Docker (addr — адрес, по которому edge достучится до сервера)
./bin/lp-agent --control-plane http://CP:8080 --addr 10.0.0.5

# 3. Edge на публичном сервере (wildcard DNS *.apps.example.com -> этот сервер)
./bin/lp-edge --control-plane http://CP:8080 --listen :80
```

Создать сервис:

```bash
curl -H "Authorization: Bearer $LP_API_TOKEN" -d '{"name":"web","image":"nginx:1","port":80}' \
  http://CP:8080/api/v1/services
curl -H "Authorization: Bearer $LP_API_TOKEN" http://CP:8080/api/v1/services
```

Сервис станет доступен на `web.apps.example.com`.

## Безопасность

- Порты контейнеров публикуются на всех интерфейсах узла. Закройте их файрволом
  так, чтобы к ним мог ходить только edge.
- Токены передаются открытым текстом, пока перед control plane нет TLS.
- Сборка чужого кода выполняется на узле. Для публичной платформы нужна изоляция
  сборок (отдельный builder) — см. план.

## Тесты

```bash
go test ./...
```

Проверено юнит-тестами: планировщик и failover, логика агента на фейковом Docker,
API-цепочка деплоя. Взаимодействие с настоящим Docker пока не проверялось.
