import { redirect } from "next/navigation";
import { getSession } from "./session";

export interface CurrentUser {
  id: string;
  email: string;
  nama: string;
  role: "TBIG" | "VENDOR";
  vendorId: string | null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId || !session.email || !session.role || !session.nama) {
    return null;
  }

  return {
    id: session.userId,
    email: session.email,
    nama: session.nama,
    role: session.role,
    vendorId: session.vendorId ?? null,
  };
}

export async function requireRole(
  allowedRole: "TBIG" | "VENDOR" | ("TBIG" | "VENDOR")[]
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const roles = Array.isArray(allowedRole) ? allowedRole : [allowedRole];
  if (!roles.includes(user.role)) {
    redirect(user.role === "TBIG" ? "/tbig/pengadaan" : "/vendor/pengadaan");
  }

  return user;
}
