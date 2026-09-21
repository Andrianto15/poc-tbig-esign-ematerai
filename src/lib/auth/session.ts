import { cookies } from "next/headers";
import { getIronSession, SessionOptions } from "iron-session";

export interface SessionData {
  userId?: string;
  email?: string;
  nama?: string;
  role?: "TBIG" | "VENDOR";
  vendorId?: string | null;
  isLoggedIn?: boolean;
}

export const defaultSession: SessionData = {
  isLoggedIn: false,
};

const sessionPassword =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32
    ? process.env.SESSION_SECRET
    : "poc-pengadaan-tbig-secure-session-key-min-32-chars";

export const sessionOptions: SessionOptions = {
  password: sessionPassword,
  cookieName: "poc_tbig_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  if (!session.isLoggedIn) {
    session.isLoggedIn = defaultSession.isLoggedIn;
  }
  return session;
}
