// Minimal CSV parsing for the medicine bulk-import screen.
//
// Hand-rolled (rather than pulling in a csv dep) because the format is small and
// well-known. Handles quoted fields, escaped quotes ("") and CRLF/LF line endings.
// Maps flexible header names onto the backend MedicineIn shape.

export type ParsedMedicine = {
  name: string;
  brand: string;
  generic: string;
  strength: string;
  pack: string;
  hsn: string;
  schedule: string;
  gst_rate: number;
  mrp: number;
  reorder_level: number;
  barcode: string;
};

export type ParseResult = {
  rows: ParsedMedicine[];
  errors: string[]; // human-readable, 1-based row references
  headers: string[];
};

/** The canonical column order used by the downloadable template. */
export const TEMPLATE_HEADERS = [
  "name",
  "brand",
  "generic",
  "strength",
  "pack",
  "hsn",
  "schedule",
  "gst_rate",
  "mrp",
  "reorder_level",
  "barcode",
];

export const TEMPLATE_CSV =
  TEMPLATE_HEADERS.join(",") +
  "\n" +
  "Paracetamol 500mg,Crocin,Paracetamol,500mg,10 tablets,3004,OTC,12,30,20,8901234567890\n";

// Header aliases -> canonical field name.
const HEADER_ALIASES: Record<string, keyof ParsedMedicine> = {
  name: "name",
  medicine: "name",
  brand: "brand",
  company: "brand",
  generic: "generic",
  salt: "generic",
  strength: "strength",
  pack: "pack",
  packing: "pack",
  hsn: "hsn",
  schedule: "schedule",
  sched: "schedule",
  gst_rate: "gst_rate",
  gst: "gst_rate",
  mrp: "mrp",
  price: "mrp",
  reorder_level: "reorder_level",
  reorder: "reorder_level",
  reorderlevel: "reorder_level",
  barcode: "barcode",
  ean: "barcode",
};

/** Split a single CSV line into fields, honouring quotes. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function toNumber(v: string, fallback: number): number {
  const n = parseFloat((v || "").replace(/[^\d.\-]/g, ""));
  return isNaN(n) ? fallback : n;
}

export function parseMedicineCsv(text: string): ParseResult {
  const errors: string[] = [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: ["File is empty"], headers: [] };
  }

  const rawHeaders = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/[\s_-]+/g, "_"));
  const headerMap = rawHeaders.map((h) => HEADER_ALIASES[h] ?? HEADER_ALIASES[h.replace(/_/g, "")]);

  if (!headerMap.includes("name")) {
    errors.push('Missing required "name" column in header row');
    return { rows: [], errors, headers: rawHeaders };
  }

  const rows: ParsedMedicine[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const rec: any = {
      name: "",
      brand: "",
      generic: "",
      strength: "",
      pack: "",
      hsn: "3004",
      schedule: "OTC",
      gst_rate: 12,
      mrp: 0,
      reorder_level: 10,
      barcode: "",
    };
    headerMap.forEach((field, idx) => {
      if (!field) return;
      const val = cells[idx] ?? "";
      if (field === "gst_rate") rec.gst_rate = Math.min(28, Math.max(0, toNumber(val, 12)));
      else if (field === "mrp") rec.mrp = Math.max(0, toNumber(val, 0));
      else if (field === "reorder_level") rec.reorder_level = Math.max(0, Math.round(toNumber(val, 10)));
      else rec[field] = val;
    });

    if (!rec.name) {
      errors.push(`Row ${i + 1}: skipped (no name)`);
      continue;
    }
    rows.push(rec as ParsedMedicine);
  }

  return { rows, errors, headers: rawHeaders };
}
