# Outreachyr

1. Clone this repo
2. Install uv: <https://docs.astral.sh/uv/getting-started/installation/>
3. Install dependencies: `uv sync`
4. Create a `.env` file with `SERPAPI_API_KEY`, `GMAIL_ADDRESS`, and `GMAIL_APP_PASSWORD`
5. Optionally modify `send.py` by adding specific recruiter emails to `TO` or changing the subject line
6. Add your email body in the `body` file
7. Start backend server: `uv run python app.py`
8. Run the script
