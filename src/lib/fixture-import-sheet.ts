import ExcelJS from "exceljs";
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, looksLikeHeader, mapHeaders, normalizeCell, rowsFromTable, rowsFromText, type Cell, type RawRow } from "./fixture-import";

const MAX_COLUMNS = 20;

/** Reads the uploaded workbook or pasted text from a preview request. Server only (exceljs). */
export async function readImportRequest(form: FormData): Promise<{ rows: RawRow[]; source: string } | { error: string }> {
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > IMPORT_MAX_BYTES) return { error: "That file is over 1 MB. Remove extra sheets or images, or split it into two files." };
    const name = file.name.toLowerCase();
    if (/\.(csv|tsv|txt)$/.test(name)) return limit(rowsFromText(await file.text()), file.name);
    if (!name.endsWith(".xlsx")) return { error: "Upload the .xlsx template, or a .csv file with the same columns." };
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    } catch {
      return { error: "That file couldn't be read as an Excel workbook. Save it as .xlsx and try again." };
    }
    const headerCells = (sheet: ExcelJS.Worksheet) => Array.from({ length: MAX_COLUMNS }, (_, index) => normalizeCell(sheet.getRow(1).getCell(index + 1).value));
    const sheet = workbook.getWorksheet("Fixtures") ?? workbook.worksheets.find((item) => looksLikeHeader(mapHeaders(headerCells(item))));
    if (!sheet) return { error: "The workbook has no Fixtures sheet. Use the template, or keep its header row (Event, Date, Start time and so on)." };
    const headers = headerCells(sheet);
    if (!looksLikeHeader(mapHeaders(headers))) return { error: "The Fixtures sheet's first row should be the template's headers: Event, Date, Start time, Duration (min), Venue, Division A, Division B, Stage, Group, Notes." };
    const body: Array<{ row: number; cells: Cell[] }> = [];
    sheet.eachRow((row, number) => {
      if (number === 1 || body.length > IMPORT_MAX_ROWS * 2) return;
      const cells = Array.from({ length: MAX_COLUMNS }, (_, index) => normalizeCell(row.getCell(index + 1).value));
      if (cells.some((cell) => String(cell).trim())) body.push({ row: number, cells });
    });
    return limit(rowsFromTable(headers, body), file.name);
  }
  const text = String(form.get("text") ?? "");
  if (text.length > IMPORT_MAX_BYTES) return { error: "That's too much text at once. Paste at most 600 rows." };
  if (!text.trim()) return { error: "Upload the filled template, or paste rows copied from it." };
  return limit(rowsFromText(text), "pasted rows");
}

function limit(rows: RawRow[], source: string): { rows: RawRow[]; source: string } | { error: string } {
  if (!rows.length) return { error: "No fixture rows found. Fill in the Fixtures sheet below the header row." };
  if (rows.length > IMPORT_MAX_ROWS) return { error: `That's ${rows.length} rows. Import at most ${IMPORT_MAX_ROWS} at a time.` };
  return { rows, source };
}
