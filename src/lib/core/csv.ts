/**
 * CSV reading and writing (RFC 4180): forgiving on the way in, careful on the
 * way out.
 *
 * parseCsv accepts what spreadsheets and export tools actually produce:
 * quoted fields with embedded newlines, any line ending, a byte-order mark,
 * semicolon or tab delimiters (European Excel, TSV), Excel's "sep=" hint and
 * broken quoting. toCsv writes files that open cleanly in Excel, Numbers and
 * Google Sheets and can't smuggle a formula into them.
 */

export type CsvCell = string | number | boolean | null | undefined;

const QUOTE = 0x22;
const LF = 0x0a;
const CR = 0x0d;

/** Excel's first-line delimiter hint ("sep=;"). */
const SEPARATOR_HINT = /^sep=([,;\t|])(?:\r\n|\n|\r|$)/i;

/** Counts delimiters on the first line (outside quotes) and picks ";" or tab only when it clearly beats ",". */
function detectDelimiter(text: string): string {
  let commas = 0;
  let semicolons = 0;
  let tabs = 0;
  let inQuotes = false;
  let started = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      started = true;
    } else if (inQuotes) {
      continue;
    } else if (char === "\n" || char === "\r") {
      if (started) break;
    } else {
      started = true;
      if (char === ",") commas++;
      else if (char === ";") semicolons++;
      else if (char === "\t") tabs++;
    }
  }
  if (tabs > commas && tabs >= semicolons) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}

/**
 * Rows of fields. Quoted fields may contain delimiters, doubled quotes and
 * line breaks (returned as "\n"); CRLF, LF and CR all end a row; a leading
 * byte-order mark, a trailing newline and blank lines are dropped. Rows keep
 * their own length. Never throws: an unterminated quote takes the rest of the
 * input as its field, and a stray quote inside an unquoted field is kept.
 */
export function parseCsv(text: string): string[][] {
  if (typeof text !== "string" || text === "") return [];
  let input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  let delimiter: string;
  const hint = SEPARATOR_HINT.exec(input);
  if (hint?.[1]) {
    delimiter = hint[1];
    input = input.slice(hint[0].length);
  } else {
    delimiter = detectDelimiter(input);
  }
  const separator = delimiter.charCodeAt(0);

  const rows: string[][] = [];
  const length = input.length;
  let row: string[] = [];
  let field = "";
  /** The current field opened with a quote. */
  let quoted = false;
  let i = 0;

  const endRow = () => {
    row.push(field);
    // A blank line is a row with one empty, unquoted field.
    if (row.length > 1 || field !== "" || quoted) rows.push(row);
    row = [];
    field = "";
    quoted = false;
  };

  while (i < length) {
    const code = input.charCodeAt(i);

    // An opening quote; spaces typed before it (`a, "b"`) are dropped.
    if (code === QUOTE && !quoted && field.trim() === "") {
      quoted = true;
      i++;
      let start = i;
      let value = "";
      for (;;) {
        const close = input.indexOf('"', i);
        if (close === -1) {
          value += input.slice(start);
          i = length;
          break;
        }
        if (input.charCodeAt(close + 1) === QUOTE) {
          value += input.slice(start, close + 1);
          i = close + 2;
          start = i;
          continue;
        }
        value += input.slice(start, close);
        i = close + 1;
        break;
      }
      field = value.includes("\r") ? value.replace(/\r\n?/g, "\n") : value;
      continue;
    }

    if (code === separator) {
      row.push(field);
      field = "";
      quoted = false;
      i++;
      continue;
    }

    if (code === LF || code === CR) {
      endRow();
      i += code === CR && input.charCodeAt(i + 1) === LF ? 2 : 1;
      continue;
    }

    // A run of ordinary characters. Text after a closing quote and stray
    // quotes inside unquoted fields are kept as they are.
    let end = i + 1;
    while (end < length) {
      const next = input.charCodeAt(end);
      if (next === separator || next === LF || next === CR || next === QUOTE) break;
      end++;
    }
    field += input.slice(i, end);
    i = end;
  }

  if (field !== "" || row.length > 0 || quoted) endRow();
  return rows;
}

/** Characters that make a spreadsheet treat a cell as a formula (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",;\t\r\n]/;

function formatCell(value: CsvCell): string {
  let text: string;
  if (value === null || value === undefined) text = "";
  else if (typeof value === "number") text = Number.isFinite(value) ? String(value) : "";
  else if (typeof value === "boolean") text = value ? "true" : "false";
  else text = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A CSV document with CRLF line endings. Fields are quoted when they contain
 * a quote, comma, semicolon, tab or line break. Text that starts like a
 * formula (= + - @ tab CR) gets a leading apostrophe so spreadsheets show it
 * as text; numbers are written as they are, so -5 stays a number.
 * `bom` adds a byte-order mark, which Excel needs to read UTF-8.
 */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<CsvCell>>, options?: { bom?: boolean }): string {
  let out = options?.bom ? "\uFEFF" : "";
  for (const row of rows) {
    const line = row.map(formatCell).join(",");
    // A lone empty field is written as "" so the row doesn't read back as a blank line.
    out += `${row.length === 1 && line === "" ? '""' : line}\r\n`;
  }
  return out;
}
