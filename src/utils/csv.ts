/**
 * CSV parsing for animal import.
 *
 * Hand-rolled rather than a library dependency: the app already hand-rolls the
 * escaping on the export side, so the two halves stay symmetrical, and a real
 * farm CSV is small enough that a straightforward character walk is never the
 * slow part.
 *
 * What it has to survive, all seen in files people actually send themselves:
 * quoted fields containing the delimiter, doubled `""` escapes, a line break
 * inside a quoted notes field, CRLF from Windows, the UTF-8 BOM Excel writes,
 * and semicolon- or tab-separated files from European Excel and Numbers.
 */

/** Delimiters worth sniffing for. Order is the tie-break order. */
export const CSV_DELIMITERS = [',', ';', '\t', '|'] as const;

export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

export type CsvParseResult = {
  /** Every row, in file order. Ragged rows are preserved as-is. */
  rows: string[][];
  /** The delimiter used — sniffed unless one was passed in. */
  delimiter: CsvDelimiter;
};

/**
 * Why a file could not be read as text at all. Each of these is reported to
 * the user with the fix, rather than being parsed into nonsense: a zip file
 * read as CSV produces rows, they are just garbage.
 */
export type CsvUnreadableReason =
  /** A .xlsx workbook — a zip archive, not text. */
  | 'xlsx'
  /** A pre-2007 .xls workbook — an OLE compound file, not text. */
  | 'legacy-excel'
  /** UTF-16, which reads as text interleaved with NUL bytes. */
  | 'utf16'
  /** Read as UTF-8 but wasn't — accented characters came through broken. */
  | 'mojibake';

const BOM = '\uFEFF';
/** U+FFFD, what a byte that isn't valid UTF-8 decodes to. */
const REPLACEMENT_CHAR = '\uFFFD';

/**
 * Excel's "CSV UTF-8" prepends a byte order mark. Left in place it becomes
 * part of the first header cell, so `Animal ID` silently stops matching.
 */
export function stripBom(text: string) {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

/**
 * Detects files that cannot be read as CSV text before any parsing is
 * attempted. Returns null when the text looks fine.
 */
export function detectUnreadable(text: string): CsvUnreadableReason | null {
  // A .xlsx is a zip archive. Every zip starts `PK` followed by a two-byte
  // record marker — \u0003\u0004 for the usual case, \u0005\u0006 for an empty
  // archive — so the control character after `PK` is what identifies it,
  // rather than any one signature. Plain text never looks like this.
  if (text.startsWith('PK') && text.charCodeAt(2) < 32) {
    return 'xlsx';
  }

  // A pre-2007 .xls is an OLE compound file starting D0 CF 11 E0 — none of
  // which is valid UTF-8, so it arrives as a run of replacement characters.
  if (countOccurrences(text.slice(0, 8), REPLACEMENT_CHAR) >= 3) {
    return 'legacy-excel';
  }

  const sample = text.slice(0, 4000);

  // UTF-16 decoded as UTF-8 leaves a NUL between every ASCII character. One
  // stray NUL could be anything; a fifth of the sample being NUL is UTF-16.
  const nulCount = countOccurrences(sample, '\u0000');

  if (nulCount > 0 && nulCount / Math.max(sample.length, 1) > 0.2) {
    return 'utf16';
  }

  // A Latin-1 file read as UTF-8 turns every accented character into U+FFFD.
  // Tag numbers and English names survive, so a handful of these means a few
  // broken names rather than an unreadable file — only call it when they are
  // frequent enough that the import would be visibly wrong.
  const replacementCount = countOccurrences(sample, REPLACEMENT_CHAR);

  if (replacementCount >= 3 && replacementCount / Math.max(sample.length, 1) > 0.005) {
    return 'mojibake';
  }

  return null;
}

/**
 * Parses CSV text into rows. Pass `delimiter` to force one; otherwise it is
 * sniffed from the content.
 */
export function parseCsv(text: string, delimiter?: CsvDelimiter): CsvParseResult {
  const source = stripBom(text);
  const resolvedDelimiter = delimiter ?? sniffDelimiter(source);

  return { rows: parseWithDelimiter(source, resolvedDelimiter), delimiter: resolvedDelimiter };
}

/**
 * Picks the delimiter that yields the most consistent table. Every candidate
 * is run through the real parser rather than counted naively, so a comma
 * inside a quoted field never votes for the comma.
 */
export function sniffDelimiter(text: string): CsvDelimiter {
  const source = stripBom(text);
  let best: { delimiter: CsvDelimiter; columns: number; consistency: number } | null = null;

  for (const candidate of CSV_DELIMITERS) {
    // Only the first rows are needed to tell delimiters apart, and stopping
    // early keeps a large file from being parsed four times over.
    const rows = parseWithDelimiter(source, candidate, 20).filter((row) => !isBlankRow(row));

    if (rows.length === 0) {
      continue;
    }

    const columns = modalColumnCount(rows);

    // A single column means this delimiter never appeared — it splits nothing.
    if (columns < 2) {
      continue;
    }

    const consistency = rows.filter((row) => row.length === columns).length / rows.length;

    // Consistency first: a file where every row has 4 fields is better read
    // than one where the count wanders, however many columns that produces.
    // The candidate order breaks exact ties, so a comma wins over a pipe.
    if (
      !best ||
      consistency > best.consistency + 0.001 ||
      (Math.abs(consistency - best.consistency) <= 0.001 && columns > best.columns)
    ) {
      best = { delimiter: candidate, columns, consistency };
    }
  }

  // No candidate split anything: a single-column file, which the tag-only
  // import path handles. Comma is the harmless default.
  return best?.delimiter ?? ',';
}

/** True when a row holds nothing but empty or whitespace-only fields. */
export function isBlankRow(row: string[]) {
  return row.every((field) => field.trim() === '');
}

/** Serialises rows back to CSV — used to build the downloadable template. */
export function toCsv(rows: string[][], delimiter: CsvDelimiter = ',') {
  return rows.map((row) => row.map((field) => escapeCsvField(field, delimiter)).join(delimiter)).join('\r\n');
}

export function escapeCsvField(value: string, delimiter: CsvDelimiter = ',') {
  const needsQuotes =
    value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r');

  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * The parser proper. `maxRows` stops early for delimiter sniffing; it is
 * unbounded for a real parse.
 *
 * A `"` opens a quoted field only at the start of a field. Anywhere else it is
 * a literal character, which is what keeps a breed of `5" horn` intact —
 * writers only ever emit an opening quote at field start.
 */
function parseWithDelimiter(source: string, delimiter: CsvDelimiter, maxRows = Infinity): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };

  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < source.length) {
    const char = source[index];

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote is an escaped quote; a lone one closes the field.
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }

        inQuotes = false;
        index += 1;
        continue;
      }

      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === delimiter) {
      endField();
      index += 1;
      continue;
    }

    if (char === '\r' || char === '\n') {
      endRow();
      // CRLF is one line ending, not two.
      index += char === '\r' && source[index + 1] === '\n' ? 2 : 1;

      if (rows.length >= maxRows) {
        return rows;
      }

      continue;
    }

    field += char;
    index += 1;
  }

  // A file that does not end in a newline still has a final row to flush. A
  // file that does ends here with nothing pending, and must not gain a
  // phantom empty row.
  if (field.length > 0 || row.length > 0 || inQuotes) {
    endRow();
  }

  return rows;
}

/** The most common field count across the rows — the table's real width. */
function modalColumnCount(rows: string[][]) {
  const counts = new Map<number, number>();

  for (const row of rows) {
    counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
  }

  let modal = 0;
  let modalFrequency = 0;

  for (const [count, frequency] of counts) {
    if (frequency > modalFrequency || (frequency === modalFrequency && count > modal)) {
      modal = count;
      modalFrequency = frequency;
    }
  }

  return modal;
}

function countOccurrences(text: string, char: string) {
  let count = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === char) {
      count += 1;
    }
  }

  return count;
}
