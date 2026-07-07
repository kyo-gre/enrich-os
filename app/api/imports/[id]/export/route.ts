import { NextResponse } from "next/server";
import { exportCreators } from "../../../../../server/services/export.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const type = new URL(request.url).searchParams.get("type");

  if (type !== "quick" && type !== "full") {
    return NextResponse.json(
      { error: "type must be 'quick' or 'full'" },
      { status: 400 },
    );
  }

  const { csv, fileName } = await exportCreators(id, type);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
