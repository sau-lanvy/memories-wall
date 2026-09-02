import { describe, expect, it, vi } from "vitest";
import type { TableClient } from "@azure/data-tables";
import { AzureTableMemoryStore } from "@/server/azure-table-memory-store";

describe("AzureTableMemoryStore", () => {
  it("ensures the table exists before the first read", async () => {
    const calls: string[] = [];
    const client = {
      createTable: vi.fn(async () => { calls.push("createTable"); }),
      listEntities: vi.fn(async function* () { calls.push("listEntities"); }),
    } as unknown as TableClient;

    await new AzureTableMemoryStore(client).list();

    expect(client.createTable).toHaveBeenCalledOnce();
    expect(calls).toEqual(["createTable", "listEntities"]);
  });

  it("continues when the table was already provisioned", async () => {
    const client = {
      createTable: vi.fn().mockRejectedValue({ statusCode: 409 }),
      listEntities: vi.fn(async function* () {}),
    } as unknown as TableClient;

    await expect(new AzureTableMemoryStore(client).list()).resolves.toEqual([]);
  });
});
