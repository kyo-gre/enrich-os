import { NextResponse } from "next/server";
import { runEnrichmentForImport } from "../../../../../server/services/enrichment.service";
import { updateImportStatus } from "../../../../../server/db/repositories/imports.repo";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await updateImportStatus(id, "processing");
  try {
    const result = await runEnrichmentForImport(id);
    await updateImportStatus(id, "completed");
    return NextResponse.json(result);
  } catch (error) {
    await updateImportStatus(id, "failed");
    throw error;
  }
}
