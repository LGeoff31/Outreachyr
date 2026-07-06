# Outreachyr

Frontend is in `frontend/`. Backend is in `backend/`.

## Local dev

```sh
cp .env.example .env

npm run dev
```

Fill in `.env` before starting. `npm run dev` starts Docker Compose with
watch mode.

- Frontend: `http://localhost:${FRONTEND_PORT}`
- Backend: `http://127.0.0.1:${BACKEND_PORT}`

To run one service:

```sh
npm run dev:backend
npm run dev:frontend
```

## Backend commands

```sh
docker compose run --rm backend uv run alembic upgrade head
docker compose run --rm backend uv run ruff check .
docker compose run --rm backend uv run ruff format --check .
docker compose run --rm backend uv run ty check
```
