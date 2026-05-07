import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-screen max-w-full overflow-hidden border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-3 text-lg font-semibold tracking-tight text-slate-950"
          aria-label="Outreachyr home"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
            >
              <path
                d="M4.5 11.1 19.7 4.7c.7-.3 1.4.4 1 1.1l-6.3 15.3c-.3.8-1.4.7-1.6-.1l-1.5-6.1-6.1-1.5c-.8-.2-.9-1.3-.1-1.6Z"
                fill="currentColor"
              />
            </svg>
          </span>
          Outreachyr.
        </Link>
        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-8 text-sm font-medium md:flex"
        >
          <Link
            href="/#how-it-works"
            className="min-h-11 content-center text-slate-600 transition hover:text-slate-950"
          >
            How it works
          </Link>
          <Link
            href="/#pricing"
            className="min-h-11 content-center text-slate-600 transition hover:text-slate-950"
          >
            Pricing
          </Link>
          <Link
            href="/dashboard"
            className="min-h-11 content-center text-slate-600 transition hover:text-slate-950"
          >
            Sign in
          </Link>
        </nav>
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
        >
          Start free
        </Link>
      </div>
    </header>
  );
}
