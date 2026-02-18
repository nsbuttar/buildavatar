import { parse as parseCsv } from "csv-parse/sync";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export interface ParsedDocument {
  text: string;
  metadata: Record<string, unknown>;
}

export async function parseDocumentBuffer(input: {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<ParsedDocument> {
  const lower = input.fileName.toLowerCase();
  if (input.mimeType.includes("pdf") || lower.endsWith(".pdf")) {
    const parsed = await pdfParse(input.bytes);
    return {
      text: parsed.text,
      metadata: {
        pages: parsed.numpages,
        info: parsed.info,
      },
    };
  }
  if (
    input.mimeType.includes("wordprocessingml") ||
    lower.endsWith(".docx")
  ) {
    const parsed = await mammoth.extractRawText({ buffer: input.bytes });
    return {
      text: parsed.value,
      metadata: {
        warnings: parsed.messages,
      },
    };
  }
  if (input.mimeType.includes("csv") || lower.endsWith(".csv")) {
    const csvText = input.bytes.toString("utf8");
    const records = parseCsv(csvText, { columns: true, skip_empty_lines: true }) as Record<
      string,
      string
    >[];
    const flattened = records
      .map((record, idx) => `Row ${idx + 1}: ${Object.entries(record).map(([key, value]) => `${key}: ${value}`).join(" | ")}`)
      .join("\n");
    return {
      text: flattened,
      metadata: { rows: records.length },
    };
  }
  const text = input.bytes.toString("utf8");
  return {
    text,
    metadata: {},
  };
}

