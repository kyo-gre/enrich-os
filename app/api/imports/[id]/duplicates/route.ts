import { NextResponse } from "next/server";
import { findDuplicateCandidates } from "../../../../../server/services/dedupe.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const groups = await findDuplicateCandidates(id);
  return NextResponse.json({ groups });
}
