/**
 * CogsCsvImport
 *
 * Upload a CSV or Excel (.xlsx) file, parse it client-side,
 * preview which rows will be matched, then commit the import.
 *
 * Expected columns (order-independent, headers required):
 *   offer_id | cogs_rands | inbound_cost_rands
 */

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  FileText,
  FileSpreadsheet,
  ChevronRight,
} from 'lucide-react';
import {
  useCsvImport,
  useCogsImportHistory,
  type CsvPreviewItem,
} from '../../hooks/useCogsImport.js';
import { apiClient } from '../../services/api.js';
import { formatCurrency } from '../../utils/format.js';
import { LastUploadBanner } from '../fees/LastUploadBanner.js';

// =============================================================================
// Parsers (CSV and xlsx — both produce the same ParsedRow[])
// =============================================================================

interface ParsedRow {
  /** Either offerId or sku (or both) must be set — backend uses one to look up the offer. */
  offerId?: number;
  sku?: string;
  cogsCents: number;
  inboundCostCents: number;
}

interface ParseError {
  row: number;
  message: string;
}

/**
 * Normalise a header string for column matching: lowercase, replace any run
 * of non-alphanumeric characters with a single underscore, then trim leading
 * and trailing underscores. This makes "★ Your Cost / COGS (R)" → "your_cost_cogs_r".
 */
const normaliseHeader = (h: unknown) =>
  String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

/**
 * Header name aliases. The Excel template uses pretty display names
 * (e.g. "★ Your Cost / COGS (R)"), the CSV template uses snake_case
 * (e.g. "cogs_rands"). Both must work.
 */
const OFFER_ID_ALIASES = new Set(['offer_id', 'offerid']);
const SKU_ALIASES = new Set(['sku', 'product_code', 'merchant_sku']);
const COGS_ALIASES = new Set([
  'cogs_rands', 'cogs_r', 'cogs', 'your_cost_cogs_r', 'your_cost', 'unit_cost', 'cost',
]);
const INBOUND_ALIASES = new Set([
  'inbound_cost_rands', 'inbound_cost_r', 'inbound_cost', 'inbound',
]);

/** Convert a raw cell value to a float, returning NaN if not parseable. */
const toFloat = (v: unknown): number => {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
};

/**
 * Find which row in the file is the actual header row. The xlsx template
 * has a banner row at index 0 and the real headers at index 1, so we
 * scan the first few rows looking for one that contains a COGS column
 * AND at least one identifier (offer_id or sku). Returns null if no
 * match is found.
 */
function findHeaderRow(rawRows: unknown[][]): {
  rowIndex: number;
  offerIdIdx: number;
  skuIdx: number;
  cogsIdx: number;
  inboundIdx: number;
} | null {
  const limit = Math.min(rawRows.length, 5);
  for (let i = 0; i < limit; i++) {
    const cells = (rawRows[i] as unknown[]).map(normaliseHeader);
    const offerIdIdx = cells.findIndex((h) => OFFER_ID_ALIASES.has(h));
    const skuIdx = cells.findIndex((h) => SKU_ALIASES.has(h));
    const cogsIdx = cells.findIndex((h) => COGS_ALIASES.has(h));
    const hasIdentifier = offerIdIdx !== -1 || skuIdx !== -1;
    if (hasIdentifier && cogsIdx !== -1) {
      const inboundIdx = cells.findIndex((h) => INBOUND_ALIASES.has(h));
      return { rowIndex: i, offerIdIdx, skuIdx, cogsIdx, inboundIdx };
    }
  }
  return null;
}

/**
 * Parse rows from a normalised 2-D array (header row + data rows).
 * Works for both CSV and xlsx — the caller supplies the raw 2-D array.
 */
function parseRows(
  rawRows: unknown[][],
): { rows: ParsedRow[]; errors: ParseError[] } {
  if (rawRows.length < 2) {
    return { rows: [], errors: [{ row: 0, message: 'File is empty or missing headers.' }] };
  }

  const header = findHeaderRow(rawRows);
  if (!header) {
    return {
      rows: [],
      errors: [{
        row: 0,
        message:
          'Could not find required columns. Expected an "Offer ID" or "SKU" column ' +
          'and a COGS column (e.g. "★ Your Cost / COGS (R)" or "cogs_rands"). ' +
          'Please use the downloaded template.',
      }],
    };
  }

  const { rowIndex, offerIdIdx, skuIdx, cogsIdx, inboundIdx } = header;
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  for (let i = rowIndex + 1; i < rawRows.length; i++) {
    const cells = rawRows[i] as unknown[];
    const rawOfferId = offerIdIdx !== -1 ? cells[offerIdIdx] : '';
    const rawSku     = skuIdx !== -1 ? cells[skuIdx] : '';
    const rawCogs    = cells[cogsIdx];
    const rawInbound = inboundIdx !== -1 ? cells[inboundIdx] : 0;

    // Skip blank COGS rows silently — common when users leave rows empty.
    if (rawCogs == null || rawCogs === '') continue;

    const offerIdStr = String(rawOfferId ?? '').trim();
    const skuStr = String(rawSku ?? '').trim();
    const offerId = offerIdStr ? parseInt(offerIdStr, 10) : NaN;
    const cogsRands = toFloat(rawCogs);
    const inboundRands = toFloat(rawInbound);

    const hasValidOfferId = !isNaN(offerId);
    const hasValidSku = skuStr.length > 0;

    if (!hasValidOfferId && !hasValidSku) {
      errors.push({
        row: i + 1,
        message: `Row ${i + 1}: needs either an offer_id or a SKU to identify the product`,
      });
      continue;
    }
    if (isNaN(cogsRands) || cogsRands < 0) {
      errors.push({ row: i + 1, message: `Row ${i + 1}: invalid cogs_rands "${rawCogs}"` });
      continue;
    }

    const parsed: ParsedRow = {
      cogsCents: Math.round(cogsRands * 100),
      inboundCostCents: isNaN(inboundRands) ? 0 : Math.round(inboundRands * 100),
    };
    if (hasValidOfferId) parsed.offerId = offerId;
    if (hasValidSku) parsed.sku = skuStr;
    rows.push(parsed);
  }

  return { rows, errors };
}

/** Parse a CSV text string into a 2-D raw array. */
function csvTo2D(text: string): unknown[][] {
  const lines = text.trim().split(/\r?\n/);
  return lines.map((line) => splitCsvLine(line));
}

/** Splits a single CSV line, respecting double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** Parse an xlsx ArrayBuffer into a 2-D raw array (first sheet). */
function xlsxTo2D(buffer: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
}

// =============================================================================
// CogsCsvImport component
// =============================================================================

export function CogsCsvImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  const [isDownloadingXlsx, setIsDownloadingXlsx] = useState(false);
  const [commitDone, setCommitDone] = useState<{
    updated: number;
    unmatched: number;
    unmatchedRows?: import('../../hooks/useCogsImport.js').UnmatchedRow[];
  } | null>(null);

  const csvImport = useCsvImport();
  const { data: history, isLoading: historyLoading } = useCogsImportHistory();
  const latestImport = history?.[0] ?? null;

  const previewData = csvImport.data?.mode === 'preview' ? csvImport.data : null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  const applyParsedResult = (result: { rows: ParsedRow[]; errors: ParseError[] }) => {
    setParseErrors(result.errors);
    setParsedRows(result.rows);
    if (result.errors.length === 0 && result.rows.length > 0) {
      csvImport.mutate({ mode: 'preview', rows: result.rows });
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleFileSelect = (file: File) => {
    setFileName(file.name);
    setParseErrors([]);
    setParsedRows([]);
    csvImport.reset();
    setCommitDone(null);

    const isXlsx =
      file.name.endsWith('.xlsx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        const raw2D = xlsxTo2D(buffer);
        applyParsedResult(parseRows(raw2D));
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const raw2D = csvTo2D(text);
        applyParsedResult(parseRows(raw2D));
      };
      reader.readAsText(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleCommit = () => {
    if (!parsedRows.length) return;
    csvImport.mutate(
      { mode: 'commit', rows: parsedRows, fileName: fileName ?? undefined },
      {
        onSuccess: (data) => {
          if (data.mode === 'commit') {
            setCommitDone({
              updated: data.updated ?? 0,
              unmatched: data.unmatched ?? 0,
              unmatchedRows: data.unmatchedRows ?? [],
            });
            setFileName(null);
            setParsedRows([]);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        },
      }
    );
  };

  const handleDownloadCsv = async () => {
    setIsDownloadingCsv(true);
    try {
      const response = await apiClient.get('/sellers/cogs/template', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data as BlobPart]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'percepta-cogs-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloadingCsv(false);
    }
  };

  const handleDownloadXlsx = async () => {
    setIsDownloadingXlsx(true);
    try {
      const response = await apiClient.get('/sellers/cogs/template/xlsx', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'percepta-cogs-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloadingXlsx(false);
    }
  };

  const handleReset = () => {
    setFileName(null);
    setParsedRows([]);
    setParseErrors([]);
    setCommitDone(null);
    csvImport.reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Render ──────────────────────────────────────────────────────────────

  // ✅ Commit success state
  if (commitDone) {
    const hasUnmatched = (commitDone.unmatchedRows?.length ?? 0) > 0;
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-500" />
          <h3 className="text-lg font-semibold text-green-800">Import complete!</h3>
          <p className="mt-1 text-sm text-green-700">
            Updated COGS for <strong>{commitDone.updated}</strong> product
            {commitDone.updated !== 1 ? 's' : ''}.
            {commitDone.unmatched > 0 && (
              <> ({commitDone.unmatched} row{commitDone.unmatched > 1 ? 's' : ''} skipped — see below)</>
            )}
          </p>
          <p className="mt-2 text-xs text-green-600">
            Profit calculations are being updated in the background.
          </p>
          <button onClick={handleReset} className="btn-secondary mt-4">
            Import another file
          </button>
        </div>

        {/* Unmatched rows breakdown — surface the WHY for each skipped row */}
        {hasUnmatched && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="mb-3 flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
              <div>
                <h4 className="text-sm font-semibold text-amber-900">
                  {commitDone.unmatched} row{commitDone.unmatched !== 1 ? 's' : ''} couldn't be matched
                </h4>
                <p className="mt-0.5 text-xs text-amber-700">
                  These products weren't found in your synced offers table. Common
                  reasons: the listing was deleted from Takealot, a typo in the
                  spreadsheet, or the product is disabled and you haven't run
                  "Sync disabled offers" yet.
                </p>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-amber-200 bg-white">
              <table className="w-full text-xs">
                <thead className="bg-amber-100/50">
                  <tr className="text-left text-amber-900">
                    <th className="px-3 py-2 font-medium">Offer ID</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 text-right font-medium">COGS (R)</th>
                    <th className="px-3 py-2 font-medium">Why it didn't match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {commitDone.unmatchedRows!.map((row, i) => (
                    <tr key={i} className="text-gray-700">
                      <td className="px-3 py-2 font-mono">{row.offerId ?? '—'}</td>
                      <td className="px-3 py-2 font-mono">{row.sku ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {(row.cogsCents / 100).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-amber-800">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-amber-700">
              Tip: copy these offer IDs/SKUs and look them up in your Takealot
              Seller Portal to confirm they still exist.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Last upload status */}
      <LastUploadBanner
        label="COGS"
        isLoading={historyLoading}
        latest={
          latestImport
            ? {
                fileName: latestImport.fileName,
                status: latestImport.status,
                createdAt: latestImport.createdAt,
                primaryCount: latestImport.matchedCount,
                secondaryCount: latestImport.unmatchedCount,
              }
            : null
        }
        primaryCountLabel="products updated"
        secondaryCountLabel="unmatched"
      />

      {/* Download template banner */}
      <div className="flex items-start gap-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-brand-800">Start with our pre-filled template</p>
          <p className="mt-0.5 text-xs text-brand-600">
            Your product list with current prices is already included. Just fill in the highlighted
            cost columns and upload the file back.
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-col gap-1.5 sm:flex-row">
          <button
            onClick={handleDownloadXlsx}
            disabled={isDownloadingXlsx}
            className="btn-primary flex items-center gap-1.5 text-xs"
            title="Recommended — formatted Excel workbook"
          >
            {isDownloadingXlsx ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" />
            )}
            Excel (.xlsx)
          </button>
          <button
            onClick={handleDownloadCsv}
            disabled={isDownloadingCsv}
            className="btn-secondary flex items-center gap-1.5 text-xs"
            title="Plain CSV — for advanced users"
          >
            {isDownloadingCsv ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            CSV
          </button>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/30"
      >
        <Upload className="h-8 w-8 text-gray-400" />
        <div>
          <p className="text-sm font-medium text-gray-700">
            {fileName ? (
              <span className="text-brand-700">{fileName}</span>
            ) : (
              <>
                Drop your file here, or{' '}
                <span className="text-brand-600 underline">browse</span>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Accepts .xlsx or .csv — must include offer_id and cogs_rands columns
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
        }}
      />

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
            <XCircle className="h-4 w-4" />
            {parseErrors.length} parse error{parseErrors.length > 1 ? 's' : ''}
          </div>
          <ul className="space-y-1 text-xs text-red-600">
            {parseErrors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview */}
      {(csvImport.isPending || previewData) && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* Summary bar */}
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800">Preview</h3>
            {csvImport.isPending && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking against your products…
              </div>
            )}
            {previewData && (
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {previewData.matched} matched
                </span>
                {(previewData.unmatched ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {previewData.unmatched} unmatched
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Preview table */}
          {previewData?.preview && (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-2 text-left">Product</th>
                    <th className="px-4 py-2 text-right">COGS</th>
                    <th className="px-4 py-2 text-right">Inbound</th>
                    <th className="px-4 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {previewData.preview.map((row: CsvPreviewItem, idx: number) => (
                    <tr
                      key={row.offerId ?? row.sku ?? `row-${idx}`}
                      className={row.matched ? '' : 'bg-red-50/50'}
                    >
                      <td className="px-4 py-2">
                        {row.matched ? (
                          <div>
                            <div className="truncate font-medium text-gray-800 max-w-[200px]">
                              {row.title ?? (row.offerId ? `#${row.offerId}` : (row.sku ?? '—'))}
                            </div>
                            {row.sku && (
                              <div className="text-xs text-gray-400">{row.sku}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {row.offerId
                              ? `Offer ID ${row.offerId} (not found)`
                              : row.sku
                                ? `SKU "${row.sku}" (not found)`
                                : 'Unknown row (not found)'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">
                        {formatCurrency(row.cogsCents)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-500">
                        {row.inboundCostCents > 0 ? formatCurrency(row.inboundCostCents) : '—'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {row.matched ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Will update
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                            <XCircle className="h-3 w-3" />
                            Skip
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Commit action */}
          {previewData && (previewData.matched ?? 0) > 0 && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500">
                Ready to update {previewData.matched} product
                {previewData.matched !== 1 ? 's' : ''}.
                {(previewData.unmatched ?? 0) > 0 && ` ${previewData.unmatched} row${(previewData.unmatched ?? 0) > 1 ? 's' : ''} will be skipped.`}
              </p>
              <button
                onClick={handleCommit}
                disabled={csvImport.isPending}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                {csvImport.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Import {previewData.matched} products
              </button>
            </div>
          )}

          {previewData && (previewData.matched ?? 0) === 0 && (
            <div className="px-4 py-4 text-center text-sm text-gray-500">
              No matching offer IDs found. Please check your file uses IDs from the template.
            </div>
          )}
        </div>
      )}

      {/* API error */}
      {csvImport.isError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4 flex-shrink-0" />
          Import failed. Please try again.
        </div>
      )}
    </div>
  );
}
