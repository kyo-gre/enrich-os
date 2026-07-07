import { NextResponse } from "next/server";
import { unmergeCreator } from "../../../../../server/services/review.service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const creator = unmergeCreator(id);
    return NextResponse.json({ creator });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to unmerge creator" },
      { status: 400 },
    );
  }
}
