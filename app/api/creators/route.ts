import { NextResponse } from "next/server";
import { listCreatorsByImport } from "../../../server/db/repositories/creators.repo";

export async function GET(request: Request) {
  const importId = new URL(request.url).searchParams.get("importId");
  if (!importId) {
    return NextResponse.json({ error: "Missing importId" }, { status: 400 });
  }

  const creators = listCreatorsByImport(importId).map((c) => ({
    id: c.id,
    firstName: c.resolved_first_name,
    lastName: c.resolved_last_name,
    confidenceScore: c.confidence_score,
    confidenceSource: c.confidence_source,
    processingStatus: c.processing_status,
    needsReview: Boolean(c.needs_review),
    reviewStatus: c.review_status,
  }));

  return NextResponse.json({ creators });
}
