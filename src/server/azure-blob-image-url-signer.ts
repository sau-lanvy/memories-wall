import { BlobServiceClient, generateBlobSASQueryParameters, StorageSharedKeyCredential, BlobSASPermissions } from "@azure/storage-blob";
import type { MemoryImageUrlSigner } from "@/server/memory-repository";

function connectionSetting(connectionString: string, name: string): string {
  const value = connectionString.split(";").find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!value) throw new Error(`Azure storage connection string is missing ${name}`);
  return value;
}

export function createAzureBlobImageUrlSigner(connectionString: string, containerName: string): MemoryImageUrlSigner {
  const accountName = connectionSetting(connectionString, "AccountName");
  const accountKey = connectionSetting(connectionString, "AccountKey");
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const container = service.getContainerClient(containerName);

  return {
    async sign(storageKey) {
      const startsOn = new Date(Date.now() - 60_000);
      const expiresOn = new Date(Date.now() + 60 * 60 * 1000);
      const sas = generateBlobSASQueryParameters({
        containerName,
        blobName: storageKey,
        permissions: BlobSASPermissions.parse("r"),
        startsOn,
        expiresOn,
      }, credential).toString();
      return `${container.getBlobClient(storageKey).url}?${sas}`;
    },
  };
}
