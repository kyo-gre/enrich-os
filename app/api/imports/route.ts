import { NextResponse } from "next/server";
import { ingestFile } from "../../../server/services/import.service";

function detectFileType(fileName: string): "csv" | "xlsx" | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  return null;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const fileType = detectFileType(file.name);
  if (!fileType) {
    return NextResponse.json(
      { error: "Unsupported file type — expected .csv or .xlsx" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await ingestFile(file.name, fileType, buffer);

  return NextResponse.json(result);
}
