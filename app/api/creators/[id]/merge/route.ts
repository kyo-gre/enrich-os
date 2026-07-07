import { NextResponse } from "next/server";
import { mergeDuplicateCreators } from "../../../../../server/services/review.service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const targetCreatorId = body?.targetCreatorId;

  if (typeof targetCreatorId !== "string" || targetCreatorId.trim() === "") {
    return NextResponse.json(
      { error: "targetCreatorId is required" },
      { status: 400 },
    );
  }

  try {
    mergeDuplicateCreators(id, targetCreatorId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to merge creators" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
