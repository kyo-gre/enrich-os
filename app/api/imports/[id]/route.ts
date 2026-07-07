import { NextResponse } from "next/server";
import { getImport } from "../../../../server/db/repositories/imports.repo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = await getImport(id);
  if (!row) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: row.id,
    fileName: row.file_name,
    rowCount: row.row_count,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  });
}
