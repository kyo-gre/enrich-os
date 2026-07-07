import { NextResponse } from "next/server";
import { getCreatorStats } from "../../../../../server/db/repositories/creators.repo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const stats = await getCreatorStats(id);
  return NextResponse.json(stats);
}
