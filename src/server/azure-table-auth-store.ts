import "server-only";

import { TableClient, type TableEntity } from "@azure/data-tables";
import type { AuthStore, AuthSession, User, VerificationChallenge } from "@/server/auth";

type AuthEntity = TableEntity & { kind: "user" | "challenge" | "session"; payload: string };

export class AzureTableAuthStore implements AuthStore {
  private readonly ready: Promise<void>;
  constructor(private readonly client: TableClient) { this.ready = this.ensureTable(); }
  private async ensureTable() { try { await this.client.createTable(); } catch (error) { if (!isStatus(error, 409)) throw error; } }
  async getUserByEmail(email: string) { await this.ready; return this.getPayload<User>("user", "users", email); }
  async getUser(id: string) { await this.ready; return this.getPayload<User>("user", "users", `id:${id}`); }
  async saveUser(user: User) {
    await this.ready;
    await this.client.upsertEntity<AuthEntity>({ partitionKey: "users", rowKey: user.email, kind: "user", payload: JSON.stringify(user) }, "Replace");
    await this.client.upsertEntity<AuthEntity>({ partitionKey: "users", rowKey: `id:${user.id}`, kind: "user", payload: JSON.stringify(user) }, "Replace");
  }
  async getChallenge(email: string) { await this.ready; return this.getPayload<VerificationChallenge>("challenge", "challenges", email); }
  async saveChallenge(challenge: VerificationChallenge) { await this.ready; await this.client.upsertEntity<AuthEntity>({ partitionKey: "challenges", rowKey: challenge.email, kind: "challenge", payload: JSON.stringify(challenge) }, "Replace"); }
  async saveSession(session: AuthSession) { await this.ready; await this.client.upsertEntity<AuthEntity>({ partitionKey: "sessions", rowKey: session.id, kind: "session", payload: JSON.stringify({ ...session, secret: "" }) }, "Replace"); }
  async getSession(id: string) { await this.ready; return this.getPayload<AuthSession>("session", "sessions", id); }
  async listSessions(userId: string) {
    await this.ready; const result: AuthSession[] = [];
    for await (const entity of this.client.listEntities<AuthEntity>({ queryOptions: { filter: `PartitionKey eq 'sessions'` } })) {
      if (entity.kind === "session") { const session = JSON.parse(entity.payload) as AuthSession; if (session.userId === userId) result.push(session); }
    }
    return result;
  }
  async deleteUser(userId: string) {
    const user = await this.getUser(userId); if (!user) return;
    await this.client.deleteEntity("users", user.email).catch((error) => { if (!isStatus(error, 404)) throw error; });
    await this.client.deleteEntity("users", `id:${userId}`).catch((error) => { if (!isStatus(error, 404)) throw error; });
    for (const session of await this.listSessions(userId)) await this.client.deleteEntity("sessions", session.id);
  }
  private async getPayload<T>(kind: AuthEntity["kind"], partitionKey: string, rowKey: string): Promise<T | null> {
    try { const entity = await this.client.getEntity<AuthEntity>(partitionKey, rowKey); return entity.kind === kind ? JSON.parse(entity.payload) as T : null; }
    catch (error) { if (isStatus(error, 404)) return null; throw error; }
  }
}

function isStatus(error: unknown, statusCode: number) {
  return typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === statusCode;
}

export function createAzureTableAuthStore(connectionString: string, tableName = "MemoriesWallAuth") {
  return new AzureTableAuthStore(TableClient.fromConnectionString(connectionString, tableName));
}
