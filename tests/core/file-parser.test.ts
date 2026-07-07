import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseCsv, parseXlsx } from "../../core/import/file-parser";

describe("parseCsv", () => {
  it("parses headers and rows", () => {
    const csv = "Full Name,Email\nMia Shpirer,mia@example.com\n";
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["Full Name", "Email"]);
    expect(rows).toEqual([{ "Full Name": "Mia Shpirer", Email: "mia@example.com" }]);
  });
});

describe("parseXlsx", () => {
  it("parses headers and rows from a workbook buffer", () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Full Name", "Email"],
      ["Mia Shpirer", "mia@example.com"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const { headers, rows } = parseXlsx(buffer);
    expect(headers).toEqual(["Full Name", "Email"]);
    expect(rows).toEqual([{ "Full Name": "Mia Shpirer", Email: "mia@example.com" }]);
  });
});
