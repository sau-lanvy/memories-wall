import "server-only";

import { BlobServiceClient } from "@azure/storage-blob";
import type { MemoryImageStorage } from "@/server/memory-repository";

export function createAzureBlobImageStorage(connectionString: string, containerName: string): MemoryImageStorage {
  const container = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);

  return {
    async upload(storageKey, bytes, mediaType) {
      await container.createIfNotExists();
      await container.getBlockBlobClient(storageKey).uploadData(bytes, {
        blobHTTPHeaders: { blobContentType: mediaType },
      });
    },
  };
}
