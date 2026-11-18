import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getUserAccess, isCentralAdmin } from "@/lib/access";
import { normalizeAssignmentRows, parseTextAssignments } from "@/lib/assignment-import";

export async function POST(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to import organizer assignments." }, { status: 401 });
  if (!isCentralAdmin(access)) return NextResponse.json({ error: "Central-admin access is required." }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (file instanceof File && file.name.toLowerCase().endsWith(".xlsx")) {
    const workbook = new ExcelJS.Workbook();
    const workbookBuffer = Buffer.from(await file.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(workbookBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return NextResponse.json({ error: "The workbook has no worksheet." }, { status: 400 });
    const headers = sheet.getRow(1).values as unknown[];
    const rows: Array<Record<string, unknown>> = [];
    sheet.eachRow((row, number) => {
      if (number === 1) return;
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (header !== null && header !== undefined && index > 0) record[String(header)] = row.getCell(index).text;
      });
      if (Object.values(record).some((value) => String(value ?? "").trim())) rows.push(record);
    });
    return NextResponse.json(normalizeAssignmentRows(rows));
  }

  const text = String(form.get("text") ?? "");
  if (!text.trim()) return NextResponse.json({ error: "Upload an .xlsx file or paste a comma- or tab-separated list." }, { status: 400 });
  return NextResponse.json(parseTextAssignments(text));
}
