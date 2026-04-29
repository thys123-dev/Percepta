import { useState, useCallback } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import {
  useSalesReportImport,
  useImportHistory,
  type SalesReportPreview,
  type SalesReportCommitResult,
} from '../../hooks/useSalesReport';
import { LastUploadBanner } from './LastUploadBanner';

interface Props {
  onImportComplete?: () => void;
}

export function SalesReportUpload({ onImportComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string>('');
  const [preview, setPreview] = useState<SalesReportPreview | null>(null);
  const [commitResult, setCommitResult] = useState<SalesReportCommitResult | null>(null);

  const importMutation = useSalesReportImport();
  const { data: history, isLoading: historyLoading } = useImportHistory();
  const latest = history?.[0] ?? null;

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      readFile(droppedFile);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) readFile(selected);
  }, []);

  function readFile(f: File) {
    setFile(f);
    setPreview(null);
    setCommitResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      // Auto-preview
      importMutation.mutate(
        { mode: 'preview', csvText: text, fileName: f.name },
        {
          onSuccess: (result) => {
            if (result.mode === 'preview') setPreview(result);
          },
        }
      );
    };
    reader.readAsText(f);
  }

  function handleCommit() {
    if (!csvText || !file) return;
    importMutation.mutate(
      { mode: 'commit', csvText, fileName: file.name },
      {
        onSuccess: (result) => {
          if (result.mode === 'commit') {
            setCommitResult(result);
            onImportComplete?.();
          }
        },
      }
    );
  }

  function handleReset() {
    setFile(null);
    setCsvText('');
    setPreview(null);
    setCommitResult(null);
    importMutation.reset();
  }

  const formatRands = (cents: number) => `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  // ── Success state ──
  if (commitResult) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
        <h3 className="mt-4 text-lg font-semibold text-green-900">Import Complete</h3>
        <p className="mt-2 text-sm text-green-700">
          Updated <strong>{commitResult.updated}</strong> orders with actual fees and ship dates.
          {commitResult.unmatched > 0 && (
            <span className="block mt-1 text-green-600">
              {commitResult.unmatched} rows could not be matched to existing orders.
            </span>
          )}
        </p>
        <p className="mt-2 text-xs text-green-600">
          Profit recalculation has been queued and will complete shortly.
        </p>
        <button onClick={handleReset} className="btn-secondary mt-6">
          Import Another Report
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Last upload status */}
      <LastUploadBanner
        label="Sales Report"
        isLoading={historyLoading}
        latest={
          latest
            ? {
                fileName: latest.fileName,
                status: latest.status,
                createdAt: latest.createdAt,
                primaryCount: latest.updatedCount,
                secondaryCount: latest.unmatchedCount,
              }
            : null
        }
        primaryCountLabel="orders updated"
        secondaryCountLabel="unmatched"
      />

      {/* Info banner */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
        <h3 className="text-sm font-medium text-blue-900">Why import your sales report?</h3>
        <ul className="mt-2 text-sm text-blue-700 list-disc list-inside space-y-1">
          <li>Compare Percepta's calculated fees against Takealot's actual charges</li>
          <li>Detect overcharges or billing errors in Success Fees, Fulfilment Fees, and Stock Transfer Fees</li>
          <li>Get precise ship dates for accurate fee matrix version selection</li>
          <li>Track Courier Collection Fees (not available via API)</li>
        </ul>
        <p className="mt-2 text-xs text-blue-600">
          Download your CSV from: Takealot Seller Portal → Reports → Sales Report
        </p>
      </div>

      {/* Drop zone */}
      {!file && (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 transition-colors hover:border-brand-400 hover:bg-brand-50"
        >
          <Upload className="h-10 w-10 text-gray-400" />
          <p className="mt-4 text-sm font-medium text-gray-700">
            Drop your Takealot Sales Report CSV here
          </p>
          <p className="mt-1 text-xs text-gray-500">or click to browse</p>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      )}

      {/* Loading state */}
      {file && importMutation.isPending && !preview && (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white p-8">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
          <span className="text-sm text-gray-600">Parsing {file.name}...</span>
        </div>
      )}

      {/* Error */}
      {importMutation.isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium text-red-900">Import failed</span>
          </div>
          <p className="mt-1 text-sm text-red-700">
            {(importMutation.error as Error)?.message ?? 'Unknown error'}
          </p>
          <button onClick={handleReset} className="btn-secondary mt-3">
            Try Again
          </button>
        </div>
      )}

      {/* Preview results */}
      {preview && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{file?.name}</p>
                  <p className="text-xs text-gray-500">
                    {preview.parsed.totalRows} rows parsed
                    {preview.parsed.parseErrors > 0 && (
                      <span className="text-amber-600"> · {preview.parsed.parseErrors} errors</span>
                    )}
                  </p>
                </div>
              </div>
              <button onClick={handleReset} className="text-sm text-gray-500 hover:text-gray-700">
                Change file
              </button>
            </div>

            {/* Matching summary */}
            <div className="grid grid-cols-2 gap-4 px-6 py-4 sm:grid-cols-4">
              <div>
                <p className="text-2xl font-bold text-green-600">{preview.matching.matched}</p>
                <p className="text-xs text-gray-500">Matched orders</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-400">{preview.matching.unmatched}</p>
                <p className="text-xs text-gray-500">Unmatched</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{preview.matching.newImports}</p>
                <p className="text-xs text-gray-500">New imports</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-400">{preview.matching.alreadyImported}</p>
                <p className="text-xs text-gray-500">Already imported</p>
              </div>
            </div>

            {/* Fee summary */}
            <div className="border-t border-gray-100 px-6 py-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Actual Fee Totals in Report</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Success Fees</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatRands(preview.feeSummary.totalSuccessFeeCents)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Fulfilment Fees</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatRands(preview.feeSummary.totalFulfilmentFeeCents)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Courier Collection</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatRands(preview.feeSummary.totalCourierCollectionFeeCents)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Stock Transfer</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatRands(preview.feeSummary.totalStockTransferFeeCents)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Gross Sales</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatRands(preview.feeSummary.totalGrossSalesCents)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Net Sales</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatRands(preview.feeSummary.totalNetSalesCents)}
                  </p>
                </div>
              </div>
            </div>

            {/* Parse errors */}
            {preview.parseErrors.length > 0 && (
              <div className="border-t border-gray-100 px-6 py-4">
                <h4 className="text-sm font-medium text-amber-700 mb-2">
                  Parse Errors ({preview.parsed.parseErrors})
                </h4>
                <div className="space-y-1">
                  {preview.parseErrors.map((err, i) => (
                    <p key={i} className="text-xs text-amber-600">
                      Line {err.line}: {err.message}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Unmatched sample */}
            {preview.unmatchedSample.length > 0 && (
              <div className="border-t border-gray-100 px-6 py-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Unmatched Orders (sample)
                </h4>
                <p className="text-xs text-gray-500 mb-2">
                  These orders from the CSV were not found in Percepta. They may need to be synced first.
                </p>
                <div className="space-y-1">
                  {preview.unmatchedSample.map((row, i) => (
                    <p key={i} className="text-xs text-gray-600">
                      Order #{row.orderId} — {row.productTitle}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3">
            <button onClick={handleReset} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={importMutation.isPending || preview.matching.matched === 0}
              className="btn-primary"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import ${preview.matching.matched} Orders`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
