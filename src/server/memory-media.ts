import {
  memoryImageSchema,
  type Memory,
  type MemoryImage,
} from "@/domain/memory";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { MemoryNotFoundError, MemoryValidationError } from "@/server/memory-repository-errors";

type ImageInput = { mediaType: string; sizeBytes: number; bytes?: Uint8Array };

export type MemoryMediaContext = {
  getOwnedMemory(memoryId: string, userId: string): Promise<Memory>;
  getReadableMemory(memoryId: string, userId: string): Promise<Memory>;
  saveMemory(memory: Memory): Promise<void>;
};

export type MemoryImageUrlSigner = { sign(storageKey: string): Promise<string> };
export type MemoryImageStorage = {
  upload(storageKey: string, bytes: Uint8Array, mediaType: string): Promise<void>;
};

function copy<T>(value: T): T { return structuredClone(value); }
function nextTimestamp(previous: string): string {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
}

export class MemoryMedia {
  constructor(
    private readonly context: MemoryMediaContext,
    private readonly imageUrlSigner?: MemoryImageUrlSigner,
    private readonly imageStorage?: MemoryImageStorage,
  ) {}

  async decorate(memory: Memory): Promise<Memory> {
    if (!this.imageUrlSigner || !memory.images?.length) return copy(memory);
    const images = await Promise.all(memory.images.map((image) => this.decorateImage(image)));
    return copy({ ...memory, images });
  }

  async attach(memoryId: string, input: ImageInput, userId: string): Promise<MemoryImage> {
    const memory = await this.context.getOwnedMemory(memoryId, userId);
    const parsed = memoryImageSchema.shape.mediaType.safeParse(input.mediaType);
    const sizeResult = z.number().int().positive().max(10_485_760).safeParse(input.sizeBytes);
    if (!parsed.success || !sizeResult.success) {
      throw new MemoryValidationError("Images must be JPG, PNG, or WebP files no larger than 10 MB");
    }
    if ((memory.images ?? []).length >= 5) throw new MemoryValidationError("A memory can have up to 5 images");
    if (this.imageStorage && (!input.bytes || input.bytes.byteLength !== sizeResult.data)) {
      throw new MemoryValidationError("The image upload was incomplete. Please choose the image again.");
    }
    const storageKey = `memory/${userId}/${randomUUID()}`;
    if (this.imageStorage && input.bytes) await this.imageStorage.upload(storageKey, input.bytes, parsed.data);
    const image = memoryImageSchema.parse({
      id: randomUUID(),
      mediaType: parsed.data,
      sizeBytes: sizeResult.data,
      storageKey,
      uploadedAt: new Date().toISOString(),
    });
    await this.context.saveMemory({
      ...memory,
      images: [...(memory.images ?? []), image],
      updatedAt: nextTimestamp(memory.updatedAt),
    });
    return copy(image);
  }

  async remove(memoryId: string, imageId: string, userId: string): Promise<Memory> {
    const memory = await this.context.getOwnedMemory(memoryId, userId);
    const images = (memory.images ?? []).filter((image) => image.id !== imageId);
    if (images.length === (memory.images ?? []).length) throw new MemoryNotFoundError("Image not found");
    const next = { ...memory, images, updatedAt: nextTimestamp(memory.updatedAt) };
    await this.context.saveMemory(next);
    return copy(next);
  }

  async getPrimary(memoryId: string, userId: string): Promise<MemoryImage | null> {
    const memory = await this.context.getReadableMemory(memoryId, userId);
    const image = (memory.images ?? [])[0];
    return image ? copy(await this.decorateImage(image)) : null;
  }

  async getGallery(memoryId: string, userId: string): Promise<MemoryImage[]> {
    const memory = await this.context.getReadableMemory(memoryId, userId);
    return Promise.all((memory.images ?? []).map((image) => this.decorateImage(image)));
  }

  private async decorateImage(image: MemoryImage): Promise<MemoryImage> {
    if (!this.imageUrlSigner) return image;
    return {
      ...image,
      url: await this.imageUrlSigner.sign(image.storageKey),
      ...(image.thumbnailKey ? { thumbnailUrl: await this.imageUrlSigner.sign(image.thumbnailKey) } : {}),
    };
  }
}
