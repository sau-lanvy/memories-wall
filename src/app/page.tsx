import { WallApp } from "@/app/wall-app";
import { demoUserId, memoryRepository } from "@/server/memory-repository";

export default async function HomePage() {
  const [memories, snapToGrid, presentation] = await Promise.all([
    memoryRepository.listMemoriesForUser(demoUserId, { wallId: "personal" }),
    memoryRepository.getWallPreference("personal", demoUserId),
    memoryRepository.getWallPresentation("personal", demoUserId),
  ]);
  return <WallApp initialData={{ memories, snapToGrid, backgroundPreset: presentation.backgroundPreset, templateId: presentation.templateId, templateVersion: presentation.templateVersion, templateRevision: presentation.revision, canUndoTemplate: Boolean(presentation.undo) }} />;
}
