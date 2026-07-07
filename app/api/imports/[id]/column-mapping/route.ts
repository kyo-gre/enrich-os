import { NextResponse } from "next/server";
import { confirmColumnMapping } from "../../../../../server/services/import.service";
import type { ColumnMapping } from "../../../../../shared/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as { mapping: ColumnMapping };

  if (!body?.mapping || typeof body.mapping !== "object") {
    return NextResponse.json({ error: "Missing mapping" }, { status: 400 });
  }

  const result = confirmColumnMapping(id, body.mapping);
  return NextResponse.json(result);
}
