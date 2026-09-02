import { describe, expect, it, vi } from "vitest";
import { AuthService, InMemoryAuthStore, normalizeEmail, type EmailDelivery } from "@/server/auth";

function service(delivery: EmailDelivery = { send: vi.fn(async () => undefined) }) {
  return { auth: new AuthService(new InMemoryAuthStore(), delivery, { now: () => new Date("2026-01-01T00:00:00.000Z") }), delivery };
}

describe("passwordless authentication", () => {
  it("canonicalizes an email without provider-specific rewrites", () => {
    expect(normalizeEmail("  Person+tag@EXAMPLE.COM ")).toBe("Person+tag@example.com");
  });

  it("delivers a six-digit challenge and provisions one user and wall", async () => {
    const { auth, delivery } = service();
    const result = await auth.requestChallenge("person@example.com", "127.0.0.1");
    expect(result.accepted).toBe(true);
    expect(vi.mocked(delivery.send)).toHaveBeenCalledWith(expect.objectContaining({ email: "person@example.com", code: expect.stringMatching(/^\d{6}$/) }));
    const code = vi.mocked(delivery.send).mock.calls[0][0].code;
    const verified = await auth.verifyChallenge("person@example.com", code);
    expect(verified.user.email).toBe("person@example.com");
    expect(verified.user.wallId).toBe("personal");
    expect(verified.session.expiresAt).toBe("2026-01-31T00:00:00.000Z");
  });

  it("rejects replay, expired, and guessed challenges", async () => {
    let current = new Date("2026-01-01T00:00:00.000Z");
    const delivery: EmailDelivery = { send: vi.fn(async () => undefined) };
    const auth = new AuthService(new InMemoryAuthStore(), delivery, { now: () => current });
    await auth.requestChallenge("person@example.com", "127.0.0.1");
    const code = vi.mocked(delivery.send).mock.calls[0]?.[0].code;
    await expect(auth.verifyChallenge("person@example.com", "000000")).rejects.toThrow("Invalid verification code");
    await auth.verifyChallenge("person@example.com", code);
    await expect(auth.verifyChallenge("person@example.com", code)).rejects.toThrow("Invalid verification code");
    await auth.requestChallenge("other@example.com", "127.0.0.1");
    current = new Date("2026-01-01T00:11:00.000Z");
    await expect(auth.verifyChallenge("other@example.com", "000000")).rejects.toThrow("expired");
  });

  it("invalidates all sessions when the email address changes", async () => {
    const { auth, delivery } = service();
    await auth.requestChallenge("person@example.com", "127.0.0.1");
    const code = vi.mocked(delivery.send).mock.calls[0]?.[0].code;
    const verified = await auth.verifyChallenge("person@example.com", code);
    await auth.requestChallenge("new@example.com", "127.0.0.1");
    const newCode = vi.mocked(delivery.send).mock.calls[1]?.[0].code;
    await auth.changeEmail(verified.session.secret, "new@example.com", newCode);
    await expect(auth.getSession(verified.session.secret)).rejects.toThrow("Session");
  });
});
