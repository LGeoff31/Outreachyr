import Link from "next/link";

export default function HomePage() {
  return (
    <div className="relative overflow-hidden bg-mesh">
      <div className="mx-auto max-w-5xl px-6 pb-24 pt-20 sm:pt-28">
        <p className="mb-4 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-400 backdrop-blur">
          React · TypeScript · Next.js App Router
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl sm:leading-tight">
          Ship recruiter outreach{" "}
          <span className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-transparent">
            without the busywork
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
          Connect your FastAPI backend for discovery + Gmail. This frontend is
          just UI — your keys and mapping stay on the server.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-violet-500/20 transition hover:bg-zinc-100"
          >
            Open dashboard
          </Link>
          <a
            href="http://127.0.0.1:5050/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-zinc-200 backdrop-blur transition hover:bg-white/10"
          >
            API docs
          </a>
        </div>

        <div className="mt-24 grid gap-6 sm:grid-cols-3">
          {[
            {
              title: "Company-aware",
              body: "Autocomplete from your Python mapping; subject & body in React forms.",
            },
            {
              title: "Dry run first",
              body: "Preview inferred addresses before a real SMTP send.",
            },
            {
              title: "Backend-owned secrets",
              body: "SerpAPI & Gmail creds never ship to the browser.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
            >
              <h2 className="text-sm font-semibold text-white">{card.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
