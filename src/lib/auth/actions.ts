"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "./session";

const loginSchema = z.object({
  email: z.string().trim().email("Format email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});

export type LoginState = {
  error?: string;
  success?: boolean;
};

export async function loginAction(
  prevState: LoginState | null,
  formData: FormData
): Promise<LoginState> {
  const rawData = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = loginSchema.safeParse(rawData);
  if (!parsed.success) {
    return { error: "Email atau password salah" };
  }

  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return { error: "Email atau password salah" };
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return { error: "Email atau password salah" };
    }

    const session = await getSession();
    session.userId = user.id;
    session.email = user.email;
    session.nama = user.nama;
    session.role = user.role;
    session.vendorId = user.vendorId;
    session.isLoggedIn = true;
    await session.save();

    const targetUrl = user.role === "TBIG" ? "/tbig/pengadaan" : "/vendor/pengadaan";
    redirect(targetUrl);
  } catch (error) {
    // Re-throw redirect so Next.js handles navigation
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("Login error:", error);
    return { error: "Terjadi kesalahan pada sistem. Silakan coba lagi." };
  }
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
