"use client";

import { useActionState } from "react";
import { loginAction, LoginState } from "@/lib/auth/actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md bg-white border border-zinc-200 rounded-xl shadow-sm p-8">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-blue-600 text-white font-bold text-xl mb-3">
            T
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Masuk ke Sistem Pengadaan</h1>
          <p className="text-sm text-zinc-500 mt-1">
            PoC Pengadaan TBIG dengan Mekari eSign & eMeterai
          </p>
        </div>

        {state?.error && (
          <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-zinc-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="nama@perusahaan.com"
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-zinc-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isPending ? "Memproses..." : "Masuk"}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-zinc-200 text-xs text-zinc-600 space-y-1 bg-zinc-50 -mx-8 -mb-8 p-6 rounded-b-xl">
          <p className="font-semibold text-zinc-800 mb-1">Akun Demo (Seed):</p>
          <p>• <strong>TBIG:</strong> tbig@poc.local / password123</p>
          <p>• <strong>Vendor 1:</strong> vendor1@poc.local / password123</p>
          <p>• <strong>Vendor 2:</strong> vendor2@poc.local / password123</p>
        </div>
      </div>
    </div>
  );
}
