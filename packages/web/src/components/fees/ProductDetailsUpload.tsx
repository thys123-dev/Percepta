/**
 * ProductDetailsUpload
 *
 * Two-step Preview → Commit upload for the Takealot Product Details CSV.
 * Backfills offer.category / brand / dimensions plus Takealot's published
 * per-product success-fee rate and fulfilment fee — all of which the API
 * doesn't return. Importing this report is the single highest-value step
 * for accurate fee discrepancy detection.
 */

import { useCallback, useState } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import {
  useProductDetailsImport,
  useProductDetailsImportHistory,
  type ProductDetailsPreview,
  type ProductDetailsCommitResult,
} from '../../hooks/useProductDetails.js';
import { LastUploadBanner } from './LastUploadBanner';

interface Props {
  onImportComplete?: () => void;
}

export function ProductDetailsUpload({ onImportComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string>('');
  const [preview, setPreview] = useState<ProductDetailsPreview | null>(null);
  const [commitResult, setCommitResult] = useState<ProductDetailsCommitResult | null>(null);

  const importMutation = useProductDetailsImport();
  const { data: history, isLoading: historyLoading } = useProductDetailsImportHistory();
  const latest = history?.[0] ?? null;

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.name.toLowerCase().endsWith('.csv')) readFile(dropped);
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

  // ── Success ──
  if (commitResult) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
        <h3 className="mt-4 text-lg font-semibold text-green-900">Import Complete</h3>
        <p className="mt-2 text-sm text-green-700">
          Updated <strong>{commitResult.updated}</strong> offers with category, dimensions, and Takealot's published fee rates.
          {commitResult.unmatched > 0 && (
            <span className="mt-1 block text-green-600">
              {commitResult.unmatched} rows didn't match an offer (probably products not in your synced catalogue).
            </span>
          )}
        </p>
        <p className="mt-2 text-xs text-green-600">
          Re-running profit calculations on {commitResult.queuedOrderCount.toLocaleString()} affected orders. Fee Discrepancies will refresh shortly.
        </p>
        <button onClick={handleReset} className="btn-secondary mt-6">
          Import another file
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LastUploadBanner
        label="Product Details"
        isLoading={historyLoading}
        latest={
          latest
            ? {
                fileName: latest.fileName,
                status: latest.status,
                createdAt: latest.createdAt,
                primaryCount: latest.matchedCount,
                secondaryCount: latest.unmatchedCount,
              }
            : null
        }
        primaryCountLabel="offers updated"
        secondaryCountLabel="unmatched"
      />

      {/* Info banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="text-sm font-medium text-blue-900">Why import the Product Details report?</h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-blue-700">
          <li>
            Backfills <strong>category</strong>, <strong>brand</strong>, and <strong>dimensions</strong> — the Takealot offers API doesn't return these.
          </li>
          <li>
            Captures Takealot's <strong>published per-product fees</strong> (Success Fee + Fulfilment Fee), so our fee discrepancy detector compares against real rates instead of category-table estimates.
          </li>
          <li>
            Triggers an automatic recalculation of profit + fee discrepancies for every order tied to an updated offer.
          </li>
        </ul>
        <p className="mt-2 text-xs text-blue-600">
          Download the CSV from: Takealot Seller Portal → Reports → Product Details
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
          <p className="mt-4 text-sm font-medium text-gray-700">Drop your Product Details CSV here</p>
          <p className="mt-1 text-xs text-gray-500">or click to browse</p>
          <input type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
        </label>
      )}

      {/* Loading */}
      {file && importMutation.isPending && !preview && (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white p-8">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
          <span className="text-sm text-gray-600">Parsing {file.name}…</span>
        </div>
      )}

      {/* Error */}
      {importMutation.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
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

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
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

            {/* Match summary */}
            <div className="grid grid-cols-2 gap-4 px-6 py-4 sm:grid-cols-2">
              <div>
                <p className="text-2xl font-bold text-green-600">{preview.matching.matched}</p>
                <p className="text-xs text-gray-500">Offers matched</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{preview.matching.unmatched}</p>
                <p className="text-xs text-gray-500">Rows not in your catalogue</p>
              </div>
            </div>

            {/* What we'll populate */}
            <div className="border-t border-gray-100 px-6 py-4">
              <h4 className="mb-3 text-sm font-medium text-gray-900">Fields we'll populate</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: 'Category', n: preview.willPopulate.category },
                  { label: 'Brand', n: preview.willPopulate.brand },
                  { label: 'Dimensions', n: preview.willPopulate.dimensions },
                  { label: 'Success-fee rate', n: preview.willPopulate.successFeeRate },
                  { label: 'Fulfilment fee', n: preview.willPopulate.fulfilmentFee },
                ].map(({ label, n }) => (
                  <div key={label} className="rounded-lg bg-gray-50 px-3 py-2">
                    <p className="text-lg font-semibold text-gray-900">{n}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {preview.parseErrors.length > 0 && (
              <div className="border-t border-gray-100 px-6 py-4">
                <h4 className="mb-2 text-sm font-medium text-amber-700">
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

            {preview.unmatchedSample.length > 0 && (
              <div className="border-t border-gray-100 px-6 py-4">
                <h4 className="mb-2 text-sm font-medium text-gray-700">Unmatched (sample)</h4>
                <p className="mb-2 text-xs text-gray-500">
                  These products from the CSV weren't found in your synced offers. They may have been deleted or never synced.
                </p>
                <div className="space-y-1">
                  {preview.unmatchedSample.map((row, i) => (
                    <p key={i} className="text-xs text-gray-600">
                      {row.tsin ? `TSIN ${row.tsin}` : ''} {row.sku ? `· ${row.sku}` : ''} — {row.productTitle ?? '?'}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
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
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Importing…
                </span>
              ) : (
                `Update ${preview.matching.matched} Offers`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
