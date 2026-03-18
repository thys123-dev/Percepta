/**
 * CogsCsvImport
 *
 * Upload a CSV file (or download the template), parse it client-side,
 * preview which rows will be matched, then commit the import.
 *
 * Expected CSV columns (order-independent, headers required):
 *   offer_id | cogs_rands | inbound_cost_rands
 */

import { useRef, useState } from 'react';
import {
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { useCsvImport, type CsvPreviewItem } from '../../hooks/useCogsImport.js';
import { apiClient } from '../../services/api.js';
import { formatCurrency } from '../../utils/format.js';

// =============================================================================
// CSV parser (client-side, no external dependency)
// =============================================================================

interface ParsedRow {
  offerId: number;
  cogsCents: number;
  inboundCostCents: number;
}

interface ParseError {
  row: number;
  message: string;
}

function parseCsv(text: string): { rows: ParsedRow[]; errors: ParseError[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { rows: [], errors: [{ row: 0, message: 'File is empty or missing headers.' }] };

  // Parse header row — find required column indices
  const rawHeader = lines[0];
  // Handle quoted fields in header
  const headers = rawHeader.split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());

  const offerIdIdx = headers.findIndex((h) => h === 'offer_id');
  const cogsIdx = headers.findIndex((h) => h === 'cogs_rands');
  const inboundIdx = headers.findIndex((h) => h === 'inbound_cost_rands');

  if (offerIdIdx === -1 || cogsIdx === -1) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message: 'Missing required columns: offer_id, cogs_rands. Please use the template.',
        },
      ],
    };
  }

  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV split — handles quoted fields with commas
    const cells = splitCsvLine(line);

    const rawOfferId = cells[offerIdIdx]?.trim();
    const rawCogs = cells[cogsIdx]?.trim();
    const rawInbound = inboundIdx !== -1 ? cells[inboundIdx]?.trim() : '0';

    const offerId = parseInt(rawOfferId ?? '', 10);
    const cogsRands = parseFloat(rawCogs ?? '');
    const inboundRands = parseFloat(rawInbound || '0');

    if (isNaN(offerId)) {
      errors.push({ row: i + 1, message: `Row ${i + 1}: invalid offer_id "${rawOfferId}"` });
      continue;
    }
    if (rawCogs === '' || rawCogs == null) continue; // Skip blank COGS rows silently
    if (isNaN(cogsRands) || cogsRands < 0) {
      errors.push({ row: i + 1, message: `Row ${i + 1}: invalid cogs_rands "${rawCogs}"` });
      continue;
    }

    rows.push({
      offerId,
      cogsCents: Math.round(cogsRands * 100),
      inboundCostCents: isNaN(inboundRands) ? 0 : Math.round(inboundRands * 100),
    });
  }

  return { rows, errors };
}

/** Splits a single CSV line, respecting double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let current = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// =============================================================================
// CogsCsvImport component
// =============================================================================

export function CogsCsvImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [commitDone, setCommitDone] = useState<{ updated: number; unmatched: number } | null>(null);

  const csvImport = useCsvImport();

  const previewData = csvImport.data?.mode === 'preview' ? csvImport.data : null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleFileSelect = (file: File) => {
    setFileName(file.name);
    setParseErrors([]);
    setParsedRows([]);
    csvImport.reset();
    setCommitDone(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { rows, errors } = parseCsv(text);
      setParseErrors(errors);
      setParsedRows(rows);

      // Auto-preview if no hard errors
      if (errors.length === 0 && rows.length > 0) {
        csvImport.mutate({ mode: 'preview', rows });
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleCommit = () => {
    if (!parsedRows.length) return;
    csvImport.mutate(
      { mode: 'commit', rows: parsedRows },
      {
        onSuccess: (data) => {
          if (data.mode === 'commit') {
            setCommitDone({
              updated: data.updated ?? 0,
              unmatched: data.unmatched ?? 0,
            });
            // Reset file state
            setFileName(null);
            setParsedRows([]);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        },
      }
    );
  };

  const handleDownloadTemplate = async () => {
    setIsDownloading(true);
    try {
      const response = await apiClient.get('/sellers/cogs/template', {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([response.data as BlobPart]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'percepta-cogs-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
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
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-500" />
        <h3 className="text-lg font-semibold text-green-800">Import complete!</h3>
        <p className="mt-1 text-sm text-green-700">
          Updated COGS for <strong>{commitDone.updated}</strong> product
          {commitDone.updated !== 1 ? 's' : ''}.
          {commitDone.unmatched > 0 && (
            <> ({commitDone.unmatched} row{commitDone.unmatched > 1 ? 's' : ''} skipped — offer IDs not found)</>
          )}
        </p>
        <p className="mt-2 text-xs text-green-600">
          Profit calculations are being updated in the background.
        </p>
        <button onClick={handleReset} className="btn-secondary mt-4">
          Import another file
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Download template banner */}
      <div className="flex items-start gap-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-brand-800">Start with our pre-filled template</p>
          <p className="mt-0.5 text-xs text-brand-600">
            Your product list with current prices is already included. Just fill in the{' '}
            <code className="rounded bg-brand-100 px-1">cogs_rands</code> column.
          </p>
        </div>
        <button
          onClick={handleDownloadTemplate}
          disabled={isDownloading}
          className="btn-secondary flex flex-shrink-0 items-center gap-1.5 text-xs"
        >
          {isDownloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Download template
        </button>
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
                Drop your CSV here, or{' '}
                <span className="text-brand-600 underline">browse</span>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Accepts .csv files — must include offer_id and cogs_rands columns
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
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
                  {previewData.preview.map((row: CsvPreviewItem) => (
                    <tr
                      key={row.offerId}
                      className={row.matched ? '' : 'bg-red-50/50'}
                    >
                      <td className="px-4 py-2">
                        {row.matched ? (
                          <div>
                            <div className="truncate font-medium text-gray-800 max-w-[200px]">
                              {row.title ?? `#${row.offerId}`}
                            </div>
                            {row.sku && (
                              <div className="text-xs text-gray-400">{row.sku}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
                            Offer ID {row.offerId} (not found)
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
                {(previewData.unmatched ?? 0) > 0 && ` ${previewData.unmatched} row${previewData.unmatched > 1 ? 's' : ''} will be skipped.`}
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
