import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { unsealData } from "iron-session";
import { sessionOptions, SessionData } from "./lib/auth/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const cookieName = sessionOptions.cookieName;
  const cookieValue = request.cookies.get(cookieName)?.value;

  let session: SessionData | null = null;
  if (cookieValue) {
    try {
      session = await unsealData<SessionData>(cookieValue, {
        password: sessionOptions.password,
      });
    } catch {
      session = null;
    }
  }

  const isLoggedIn = Boolean(session?.isLoggedIn && session?.userId);
  const userRole = session?.role;

  // Root redirect
  if (pathname === "/") {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.redirect(
      new URL(userRole === "TBIG" ? "/tbig/pengadaan" : "/vendor/pengadaan", request.url)
    );
  }

  // Login page access when already authenticated
  if (pathname === "/login") {
    if (isLoggedIn) {
      return NextResponse.redirect(
        new URL(userRole === "TBIG" ? "/tbig/pengadaan" : "/vendor/pengadaan", request.url)
      );
    }
    return NextResponse.next();
  }

  // Protect /tbig/* routes
  if (pathname.startsWith("/tbig")) {
    if (!isLoggedIn || userRole !== "TBIG") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  // Protect /vendor/* routes
  if (pathname.startsWith("/vendor")) {
    if (!isLoggedIn || userRole !== "VENDOR") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/tbig/:path*",
    "/vendor/:path*",
  ],
};
