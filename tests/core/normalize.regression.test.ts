import { describe, expect, it } from "vitest";
import { normalizeCreator } from "../../core/normalization/normalize";

/**
 * Permanent regression tests for messy real-world influencer-spreadsheet names.
 * These are representative of actual data seen in the wild — if a future
 * normalization change breaks any of these, it should fail loudly here.
 */
describe("normalizeCreator — messy real-world name regressions", () => {
  const cases: Array<[string, string]> = [
    ["👑 Sarah | UGC Creator", "Sarah"],
    ["Dr. Jennifer Lee", "Jennifer Lee"],
    ["Emily | Mom of 3", "Emily"],
    ["John 🚀 Travel Creator", "John"],
    ["Mike | Fitness | Coach", "Mike"],
  ];

  it.each(cases)("normalizes %j to %j", (input, expected) => {
    const result = normalizeCreator({ rawFullName: input, raw: {} });
    expect(result.fullName).toBe(expected);
  });
});
