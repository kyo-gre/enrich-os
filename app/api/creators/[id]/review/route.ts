import { NextResponse } from "next/server";
import {
  approveCreator,
  ignoreCreator,
} from "../../../../../server/services/review.service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const action = body?.action;

  if (action !== "approve" && action !== "ignore") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'ignore'" },
      { status: 400 },
    );
  }

  try {
    if (action === "approve") approveCreator(id);
    else ignoreCreator(id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update review status" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
