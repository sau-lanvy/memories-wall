import { WallApp } from "@/app/wall-app";
import { demoUserId, memoryRepository } from "@/server/memory-repository";

export default async function HomePage() {
  const [memories, snapToGrid] = await Promise.all([
    memoryRepository.listMemoriesForUser(demoUserId, { wallId: "personal" }),
    memoryRepository.getWallPreference("personal", demoUserId),
  ]);
  return <WallApp initialData={{ memories, snapToGrid }} />;
}
