# Outreachyr

This repo is split into separately deployable app roots:

- `frontend/` contains the Next.js UI.
- `backend/` contains the FastAPI API and outreach email code.

## Local dev

After installing each app's dependencies, start both apps from the repo root with one command:

```sh
npm run dev
```

This starts the backend on `http://127.0.0.1:5050` and the frontend on `http://localhost:3000`.
When the repo is shared between Windows and WSL, the root dev command keeps the backend Python environments and uv caches separate so Linux does not overwrite Windows' `.venv`.

## Backend

1. Install uv: <https://docs.astral.sh/uv/getting-started/installation/>
2. Go to the backend app: `cd backend`
3. Install dependencies: `uv sync`
4. Create a `.env` file with `SERPAPI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`.
5. Run migrations from `backend/`: `uv run alembic upgrade head` (this creates app tables, the `user_resumes` library table, a private `resumes` storage bucket, and RLS policies).
6. Optionally modify `send.py` by adding specific recruiter emails to `TO` or changing the subject line
7. Add your email body in the `body` file
8. Start the API: `uv run python app.py`

The API runs on `http://127.0.0.1:5050`.

### Backend quality checks

Run backend linting, formatting, and type checking from `backend/`:

```sh
uv run ruff check .
uv run ruff format --check .
uv run ty check
```

## Frontend

1. Go to the frontend app: `cd frontend`
2. Install dependencies: `npm install`
3. Create `.env` from `frontend/.env.example` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Start the UI: `npm run dev`

The UI runs on `http://localhost:3000` and proxies `/api/*` to the backend. Set `OUTREACH_API_URL` if the backend is not running on `http://127.0.0.1:5050`.
