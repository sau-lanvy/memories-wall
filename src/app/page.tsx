import { WallApp } from "@/app/wall-app";
import { AuthGate } from "@/app/auth-gate";
import { getCurrentUser } from "@/server/auth-actions";
import { memoryRepository } from "@/server/memory-repository";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) return <AuthGate />;
  const [memories, snapToGrid, presentation] = await Promise.all([
    memoryRepository.listMemoriesForUser(user.id, { wallId: user.wallId }),
    memoryRepository.getWallPreference(user.wallId, user.id),
    memoryRepository.getWallPresentation(user.wallId, user.id),
  ]);
  return <WallApp initialData={{ memories, snapToGrid, userId: user.id, backgroundPreset: presentation.backgroundPreset, templateId: presentation.templateId, templateVersion: presentation.templateVersion, templateRevision: presentation.revision, canUndoTemplate: Boolean(presentation.undo) }} />;
}
