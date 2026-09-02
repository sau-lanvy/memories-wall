"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { authService, AuthError, InvalidChallengeError, SessionError } from "@/server/auth";

const COOKIE_NAME = "memories_wall_session";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 30 * 24 * 60 * 60 };

export type AuthActionResult = { ok: true; data: { email: string } } | { ok: false; error: string };

export async function requestVerificationCode(email: string): Promise<AuthActionResult> {
  try {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await authService.requestChallenge(email, ip);
    return { ok: true, data: { email: email.trim() } };
  } catch (error) {
    return { ok: false, error: error instanceof AuthError ? error.message : "We could not send a code. Please try again." };
  }
}

export async function verifyVerificationCode(email: string, code: string): Promise<AuthActionResult> {
  try {
    const result = await authService.verifyChallenge(email, code);
    (await cookies()).set(COOKIE_NAME, result.session.secret, cookieOptions);
    revalidatePath("/");
    return { ok: true, data: { email: result.user.email } };
  } catch (error) {
    return { ok: false, error: error instanceof InvalidChallengeError ? error.message : "We could not verify that code. Please try again." };
  }
}

export async function signOutAction(): Promise<{ ok: true }> {
  const secret = (await cookies()).get(COOKIE_NAME)?.value;
  if (secret) await authService.revokeSession(secret);
  (await cookies()).set(COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 });
  revalidatePath("/");
  return { ok: true };
}

export async function getCurrentUser() {
  const secret = (await cookies()).get(COOKIE_NAME)?.value;
  if (!secret) return null;
  try { return (await authService.getSession(secret)).user; } catch (error) {
    if (error instanceof SessionError) return null;
    throw error;
  }
}
