import { NextResponse } from "next/server";
import { addMemoryImagesAction } from "@/server/actions";

export async function POST(request: Request, { params }: { params: Promise<{ memoryId: string }> }) {
  const { memoryId } = await params;
  const result = await addMemoryImagesAction(memoryId, await request.formData());
  return NextResponse.json(result);
}
