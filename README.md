# Outreachyr

This repo is split into separately deployable app roots:

- `frontend/` contains the Next.js UI.
- `backend/` contains the FastAPI API and outreach email code.

## Backend

1. Install uv: <https://docs.astral.sh/uv/getting-started/installation/>
2. Go to the backend app: `cd backend`
3. Install dependencies: `uv sync`
4. Create a `.env` file with `SERPAPI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `DATABASE_URL` (see `backend/.env.example`).
5. Run migrations from `backend/`: `uv run alembic upgrade head`
6. Optionally modify `send.py` by adding specific recruiter emails to `TO` or changing the subject line
7. Add your email body in the `body` file
8. Start the API: `uv run python app.py`

The API runs on `http://127.0.0.1:5050`.

## Frontend

1. Go to the frontend app: `cd frontend`
2. Install dependencies: `npm install`
3. Start the UI: `npm run dev`

The UI runs on `http://localhost:3000` and proxies `/api/*` to the backend. Set `OUTREACH_API_URL` if the backend is not running on `http://127.0.0.1:5050`.
