import { NextResponse } from "next/server";
import { runEnrichmentForImport } from "../../../../../server/services/enrichment.service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await runEnrichmentForImport(id);
  return NextResponse.json(result);
}
