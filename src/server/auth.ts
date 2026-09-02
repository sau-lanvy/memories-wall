import "server-only";

import { createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { createAzureTableAuthStore } from "@/server/azure-table-auth-store";

export type User = { id: string; email: string; wallId: "personal"; createdAt: string; updatedAt: string };
export type VerificationChallenge = { id: string; email: string; codeHash: string; salt: string; createdAt: string; expiresAt: string; attempts: number; consumedAt?: string };
export type AuthSession = { id: string; userId: string; secret: string; createdAt: string; expiresAt: string; revokedAt?: string };
export type EmailDelivery = { send(message: { email: string; code: string; expiresAt: string }): Promise<void> };
export class CapturingEmailDelivery implements EmailDelivery {
  readonly messages: Array<{ email: string; code: string; expiresAt: string }> = [];
  async send(message: { email: string; code: string; expiresAt: string }) { this.messages.push(message); }
}
export type AuthStore = {
  getUserByEmail(email: string): Promise<User | null>;
  getUser(id: string): Promise<User | null>;
  saveUser(user: User): Promise<void>;
  getChallenge(email: string): Promise<VerificationChallenge | null>;
  saveChallenge(challenge: VerificationChallenge): Promise<void>;
  saveSession(session: AuthSession): Promise<void>;
  getSession(id: string): Promise<AuthSession | null>;
  listSessions(userId: string): Promise<AuthSession[]>;
  deleteUser(userId: string): Promise<void>;
  deleteUserEmail?(email: string, userId: string): Promise<void>;
};

export class AuthError extends Error {}
export class InvalidChallengeError extends AuthError {}
export class SessionError extends AuthError {}

export function normalizeEmail(value: string): string {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1 || /\s/.test(trimmed)) throw new AuthError("Enter a valid email address.");
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (!/^[^\s@]+$/.test(local) || !/^[^\s@]+\.[^\s@]+$/.test(domain)) throw new AuthError("Enter a valid email address.");
  return `${local}@${domain}`;
}

function hashCode(code: string, salt: string): string { return scryptSync(code, salt, 32).toString("hex"); }
function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex"); const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
function hashSession(secret: string): string { return scryptSync(secret, "memories-wall-session", 32).toString("hex"); }
function createSecret(): string { return `${randomUUID()}${randomUUID()}`; }

export class InMemoryAuthStore implements AuthStore {
  private readonly users = new Map<string, User>();
  private readonly challenges = new Map<string, VerificationChallenge>();
  private readonly sessions = new Map<string, AuthSession>();
  async getUserByEmail(email: string) { return [...this.users.values()].find((user) => user.email === email) ?? null; }
  async getUser(id: string) { return this.users.get(id) ?? null; }
  async saveUser(user: User) { this.users.set(user.id, structuredClone(user)); }
  async getChallenge(email: string) { return this.challenges.get(email) ?? null; }
  async saveChallenge(challenge: VerificationChallenge) { this.challenges.set(challenge.email, structuredClone(challenge)); }
  async saveSession(session: AuthSession) { this.sessions.set(session.id, structuredClone({ ...session, secret: "" })); }
  async getSession(id: string) { return this.sessions.get(id) ?? null; }
  async listSessions(userId: string) { return [...this.sessions.values()].filter((session) => session.userId === userId); }
  async deleteUser(userId: string) {
    const user = this.users.get(userId);
    if (user) this.users.delete(userId);
    for (const [id, session] of this.sessions) if (session.userId === userId) this.sessions.delete(id);
  }
  async deleteUserEmail() {}
}

export class AuthService {
  private readonly requestTimes = new Map<string, number[]>();
  private readonly verificationLocks = new Map<string, Promise<void>>();
  constructor(private readonly store: AuthStore, private readonly delivery: EmailDelivery, private readonly clock: { now(): Date } = { now: () => new Date() }) {}

  async requestChallenge(rawEmail: string, ip = "unknown"): Promise<{ accepted: true }> {
    const email = normalizeEmail(rawEmail); const now = this.clock.now(); const timestamp = now.getTime();
    const key = `${email}:${ip}`; const recent = (this.requestTimes.get(key) ?? []).filter((time) => timestamp - time < 60_000);
    if (recent.length >= 1) return { accepted: true };
    this.requestTimes.set(key, [...recent, timestamp]);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const salt = randomBytes(16).toString("hex");
    const challenge: VerificationChallenge = { id: randomUUID(), email, salt, codeHash: hashCode(code, salt), createdAt: now.toISOString(), expiresAt: new Date(timestamp + 10 * 60_000).toISOString(), attempts: 0 };
    await this.store.saveChallenge(challenge);
    try { await this.delivery.send({ email, code, expiresAt: challenge.expiresAt }); } catch (error) {
      console.error("[auth] verification challenge delivery failed", error instanceof Error ? error.message : "unknown error");
    }
    return { accepted: true };
  }

  async verifyChallenge(rawEmail: string, code: string): Promise<{ user: User; session: AuthSession }> {
    const previous = this.verificationLocks.get(rawEmail);
    let release!: () => void;
    const lock = new Promise<void>((resolve) => { release = resolve; });
    this.verificationLocks.set(rawEmail, lock);
    if (previous) await previous;
    try {
    const email = normalizeEmail(rawEmail); const challenge = await this.store.getChallenge(email); const now = this.clock.now();
    if (!challenge || challenge.consumedAt || new Date(challenge.expiresAt) <= now || challenge.attempts >= 5) throw new InvalidChallengeError("Invalid verification code or expired challenge.");
    if (!/^\d{6}$/.test(code) || !sameHash(challenge.codeHash, hashCode(code, challenge.salt))) {
      challenge.attempts += 1; await this.store.saveChallenge(challenge);
      throw new InvalidChallengeError(challenge.attempts >= 5 ? "Invalid verification code; request a new code." : "Invalid verification code.");
    }
    challenge.consumedAt = now.toISOString(); await this.store.saveChallenge(challenge);
    let user = await this.store.getUserByEmail(email);
    if (!user) { user = { id: randomUUID(), email, wallId: "personal", createdAt: now.toISOString(), updatedAt: now.toISOString() }; await this.store.saveUser(user); }
    const secret = createSecret(); const session: AuthSession = { id: hashSession(secret), userId: user.id, secret, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000).toISOString() };
    await this.store.saveSession(session); return { user, session };
    } finally {
      release();
      if (this.verificationLocks.get(rawEmail) === lock) this.verificationLocks.delete(rawEmail);
    }
  }

  async getSession(secret: string): Promise<{ user: User; session: AuthSession }> {
    const session = await this.store.getSession(hashSession(secret)); const now = this.clock.now();
    if (!session || session.revokedAt || new Date(session.expiresAt) <= now) throw new SessionError("Session is no longer valid.");
    const user = await this.store.getUser(session.userId); if (!user) throw new SessionError("Session is no longer valid.");
    return { user, session };
  }
  async revokeSession(secret: string) { const session = await this.store.getSession(hashSession(secret)); if (session) { session.revokedAt = this.clock.now().toISOString(); await this.store.saveSession(session); } }
  async revokeAllSessions(userId: string) { for (const session of await this.store.listSessions(userId)) { session.revokedAt = this.clock.now().toISOString(); await this.store.saveSession(session); } }
  async changeEmail(secret: string, rawEmail: string, code: string) {
    const { user } = await this.getSession(secret); const email = normalizeEmail(rawEmail); const challenge = await this.store.getChallenge(email); const now = this.clock.now();
    if (!challenge || challenge.consumedAt || new Date(challenge.expiresAt) <= now || !sameHash(challenge.codeHash, hashCode(code, challenge.salt))) throw new InvalidChallengeError("Invalid verification code.");
    if (email !== user.email && await this.store.getUserByEmail(email)) throw new AuthError("That email address is already in use.");
    challenge.consumedAt = now.toISOString(); await this.store.saveChallenge(challenge);
    if (this.store.deleteUserEmail) await this.store.deleteUserEmail(user.email, user.id);
    user.email = email; user.updatedAt = now.toISOString(); await this.store.saveUser(user); await this.revokeAllSessions(user.id);
  }
  async deleteUser(secret: string) { const { user } = await this.getSession(secret); await this.store.deleteUser(user.id); }
}

class ResendEmailDelivery implements EmailDelivery {
  async send(message: { email: string; code: string; expiresAt: string }) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.AUTH_EMAIL_FROM;
    if (!apiKey || !from) throw new AuthError("Email delivery is not configured.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [message.email], subject: "Your Memories Wall verification code", text: `Your verification code is ${message.code}. It expires at ${message.expiresAt}. Do not share this code.` }),
    });
    if (!response.ok) throw new AuthError("Email delivery failed.");
  }
}

const delivery: EmailDelivery = process.env.NODE_ENV === "production" ? new ResendEmailDelivery() : new CapturingEmailDelivery();
if (process.env.NODE_ENV === "production" && !process.env.AZURE_STORAGE_CONNECTION_STRING) throw new AuthError("Azure authentication storage is not configured.");
const configuredStore = process.env.AZURE_STORAGE_CONNECTION_STRING
  ? createAzureTableAuthStore(process.env.AZURE_STORAGE_CONNECTION_STRING, process.env.AZURE_AUTH_TABLE_NAME)
  : new InMemoryAuthStore();
export const authService = new AuthService(configuredStore, delivery);
