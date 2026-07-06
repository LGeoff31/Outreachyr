import { NextResponse, type NextRequest } from "next/server";

function hostName(host: string) {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    return trimmed.slice(0, trimmed.indexOf("]") + 1);
  }
  return trimmed.split(":")[0] ?? "";
}

export function middleware(request: NextRequest) {
  const host = hostName(request.headers.get("host") ?? "");

  if (host === "0.0.0.0" || host === "[::]" || host === "::") {
    const url = request.nextUrl.clone();
    url.hostname = "localhost";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
