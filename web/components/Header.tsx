import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-white"
        >
          Outreachyr
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/dashboard"
            className="text-zinc-400 transition hover:text-white"
          >
            Dashboard
          </Link>
          <a
            href="http://127.0.0.1:5050/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 transition hover:text-white"
          >
            API
          </a>
        </nav>
      </div>
    </header>
  );
}
