import { NextResponse } from "next/server";
import {
  applyCreatorOverride,
  OVERRIDABLE_FIELDS,
  type OverridableField,
} from "../../../../../server/services/review.service";

function isOverridableField(value: unknown): value is OverridableField {
  return (
    typeof value === "string" &&
    (OVERRIDABLE_FIELDS as readonly string[]).includes(value)
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const { field, value, reason } = body ?? {};

  if (!isOverridableField(field)) {
    return NextResponse.json(
      { error: `field must be one of: ${OVERRIDABLE_FIELDS.join(", ")}` },
      { status: 400 },
    );
  }
  if (typeof value !== "string" || value.trim() === "") {
    return NextResponse.json(
      { error: "value must be a non-empty string" },
      { status: 400 },
    );
  }

  try {
    const creator = await applyCreatorOverride(
      id,
      field,
      value,
      typeof reason === "string" ? reason : undefined,
    );
    return NextResponse.json({ creator });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply override" },
      { status: 400 },
    );
  }
}
