import { describe, expect, it } from "vitest";
import {
  mapRowToCreatorInput,
  suggestColumnMapping,
} from "../../core/import/column-mapper";

describe("suggestColumnMapping", () => {
  it("detects common column name variants", () => {
    const mapping = suggestColumnMapping([
      "Full Name",
      "Email Address",
      "Instagram",
      "Handle",
      "Unrelated Column",
    ]);
    expect(mapping["Full Name"]).toBe("fullName");
    expect(mapping["Email Address"]).toBe("email");
    expect(mapping["Instagram"]).toBe("profileUrl");
    expect(mapping["Handle"]).toBe("username");
    expect(mapping["Unrelated Column"]).toBeUndefined();
  });

  it("is case and separator insensitive", () => {
    const mapping = suggestColumnMapping(["full_name", "USER-NAME"]);
    expect(mapping["full_name"]).toBe("fullName");
    expect(mapping["USER-NAME"]).toBe("username");
  });
});

describe("mapRowToCreatorInput", () => {
  it("maps a raw row using a confirmed mapping", () => {
    const row = { Name: "Mia Shpirer", "Email Address": "mia@example.com" };
    const mapping = { Name: "fullName" as const, "Email Address": "email" as const };
    const result = mapRowToCreatorInput(row, mapping);
    expect(result.rawFullName).toBe("Mia Shpirer");
    expect(result.rawEmail).toBe("mia@example.com");
    expect(result.raw).toBe(row);
  });

  it("takes the first non-empty value when two headers map to the same field", () => {
    const row = { Instagram: "", TikTok: "https://tiktok.com/@mia" };
    const mapping = {
      Instagram: "profileUrl" as const,
      TikTok: "profileUrl" as const,
    };
    const result = mapRowToCreatorInput(row, mapping);
    expect(result.rawProfileUrl).toBe("https://tiktok.com/@mia");
  });
});
