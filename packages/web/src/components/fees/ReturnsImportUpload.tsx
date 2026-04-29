/**
 * ReturnsImportUpload
 *
 * Two-step Preview → Commit upload for the Takealot Returns Export XLSX.
 * Mirrors AccountTransactionUpload but accepts .xlsx and base64-encodes the
 * binary payload before posting as JSON.
 */

import { useState, useCallback } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import {
  useTakealotReturnsImport,
  useTakealotReturnsImportHistory,
  fileToBase64,
} from '../../hooks/useReturns.js';
import { LastUploadBanner } from './LastUploadBanner';
import type {
  TakealotReturnsPreview,
  TakealotReturnsCommitResult,
} from '@percepta/shared';

interface Props {
  onImportComplete?: () => void;
}

// Reason strings come straight from the Takealot export — verified against
// real fixture: "Defective or damaged", "Not what I ordered", "Changed my
// mind", "Customer Cancellation", "Failed delivery", "Exception". Unknown
// reasons fall through to the default grey badge.
const REASON_BADGE_COLOURS: Record<string, string> = {
  'Defective or damaged': 'bg-red-100 text-red-800',
  'Not what I ordered': 'bg-amber-100 text-amber-800',
  'Changed my mind': 'bg-blue-100 text-blue-800',
  'Customer Cancellation': 'bg-purple-100 text-purple-800',
  Exchange: 'bg-purple-100 text-purple-800',
  'Failed delivery': 'bg-gray-100 text-gray-700',
  Exception: 'bg-gray-100 text-gray-700',
};

export function ReturnsImportUpload({ onImportComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [preview, setPreview] = useState<TakealotReturnsPreview | null>(null);
  const [commitResult, setCommitResult] = useState<TakealotReturnsCommitResult | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const importMutation = useTakealotReturnsImport();
  const { data: history, isLoading: historyLoading } = useTakealotReturnsImportHistory();
  const latest = history?.[0] ?? null;

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.toLowerCase().endsWith('.xlsx')) {
      void readFile(droppedFile);
    } else {
      setReadError('Please upload an .xlsx file (the Takealot Returns Export).');
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) void readFile(selected);
  }, []);

  async function readFile(f: File) {
    setFile(f);
    setPreview(null);
    setCommitResult(null);
    setReadError(null);
    try {
      const b64 = await fileToBase64(f);
      setFileBase64(b64);
      importMutation.mutate(
        { mode: 'preview', fileBase64: b64, fileName: f.name },
        {
          onSuccess: (result) => {
            if (result.mode === 'preview') setPreview(result);
          },
        }
      );
    } catch (err) {
      setReadError((err as Error).message ?? 'Could not read file');
    }
  }

  function handleCommit() {
    if (!fileBase64 || !file) return;
    importMutation.mutate(
      { mode: 'commit', fileBase64, fileName: file.name },
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
    setFileBase64('');
    setPreview(null);
    setCommitResult(null);
    setReadError(null);
    importMutation.reset();
  }

  const formatRands = (cents: number) =>
    `R${(Math.abs(cents) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  const newReturns = preview
    ? preview.parsed.totalRows - preview.duplicateCount
    : 0;

  // ── Success ──
  if (commitResult) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
        <h3 className="mt-4 text-lg font-semibold text-green-900">Import Complete</h3>
        <p className="mt-2 text-sm text-green-700">
          Imported <strong>{commitResult.inserted}</strong> returns.
          {commitResult.duplicatesSkipped > 0 && (
            <span className="mt-1 block text-green-600">
              {commitResult.duplicatesSkipped} duplicate returns were skipped.
            </span>
          )}
          {commitResult.ordersUpdated > 0 && (
            <span className="mt-1 block text-green-600">
              {commitResult.ordersUpdated} orders flagged with reversal data.
            </span>
          )}
        </p>
        <p className="mt-2 text-xs text-green-600">
          The Inventory → Returns tab is now enriched with reasons, comments, and stock outcomes.
        </p>
        <button onClick={handleReset} className="btn-secondary mt-6">
          Import Another File
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Last upload status */}
      <LastUploadBanner
        label="Returns Export"
        isLoading={historyLoading}
        latest={
          latest
            ? {
                fileName: latest.fileName,
                status: latest.status,
                createdAt: latest.createdAt,
                primaryCount: latest.insertedCount,
                secondaryCount: latest.duplicateCount,
                dateRangeStart: latest.dateRangeStart,
                dateRangeEnd: latest.dateRangeEnd,
              }
            : null
        }
        primaryCountLabel="returns imported"
        secondaryCountLabel="duplicates skipped"
      />

      {/* Info banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="text-sm font-medium text-blue-900">Why import the Takealot Returns Export?</h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-blue-700">
          <li>See <strong>why</strong> customers returned each unit (Defective, Changed mind, etc.)</li>
          <li>Read the customer's own comment about the return</li>
          <li>Track which returns came back to <strong>sellable stock</strong> vs were sent for <strong>removal</strong></li>
          <li>Know when a return is <em>ready to collect</em> and when it's <em>added back to stock</em></li>
          <li>Tie removal-order numbers to their refund and removal fees</li>
        </ul>
        <p className="mt-2 text-xs text-blue-600">
          Download the .xlsx from: Takealot Seller Portal → Returns → Export
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
            Drop your Takealot Returns Export (.xlsx) here
          </p>
          <p className="mt-1 text-xs text-gray-500">or click to browse</p>
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      )}

      {/* Read error */}
      {readError && !file && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {readError}
        </div>
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
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{file?.name}</p>
                  <p className="text-xs text-gray-500">
                    {preview.parsed.totalRows} returns parsed
                    {preview.parsed.parseErrors > 0 && (
                      <span className="text-amber-600"> · {preview.parsed.parseErrors} errors</span>
                    )}
                    {preview.dateRange && (
                      <span className="text-gray-400">
                        {' '}· {new Date(preview.dateRange.earliest).toLocaleDateString()} –{' '}
                        {new Date(preview.dateRange.latest).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button onClick={handleReset} className="text-sm text-gray-500 hover:text-gray-700">
                Change file
              </button>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4 px-6 py-4 sm:grid-cols-4">
              <div>
                <p className="text-2xl font-bold text-blue-600">{newReturns}</p>
                <p className="text-xs text-gray-500">New returns</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-400">{preview.duplicateCount}</p>
                <p className="text-xs text-gray-500">Duplicates (skip)</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{preview.orderLinked.matchedToOrders}</p>
                <p className="text-xs text-gray-500">Orders matched</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">
                  {formatRands(preview.totalReversalCents)}
                </p>
                <p className="text-xs text-gray-500">Total reversals</p>
              </div>
            </div>

            {/* Stock outcome breakdown */}
            <div className="grid grid-cols-3 gap-4 border-t border-gray-100 px-6 py-4 text-sm">
              <div>
                <p className="font-semibold text-green-700">{preview.byStockOutcome.sellable}</p>
                <p className="text-xs text-gray-500">Returned to sellable stock</p>
              </div>
              <div>
                <p className="font-semibold text-amber-700">{preview.byStockOutcome.removalOrder}</p>
                <p className="text-xs text-gray-500">Sent for removal</p>
              </div>
              <div>
                <p className="font-semibold text-gray-500">{preview.byStockOutcome.pending}</p>
                <p className="text-xs text-gray-500">Still in transit</p>
              </div>
            </div>

            {/* By reason */}
            <div className="border-t border-gray-100 px-6 py-4">
              <h4 className="mb-3 text-sm font-medium text-gray-900">Returns by Reason</h4>
              <div className="space-y-2">
                {Object.entries(preview.byReason)
                  .sort(([, a], [, b]) => b.count - a.count)
                  .map(([reason, data]) => (
                    <div
                      key={reason}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                    >
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          REASON_BADGE_COLOURS[reason] ?? 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {reason}
                      </span>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-700">
                          {data.count} returns · {data.quantity} units
                        </span>
                        <span className="text-red-600">{formatRands(data.reversalCents)}</span>
                      </div>
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
                      Row {err.line}: {err.message}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {preview.duplicateCount > 0 && (
              <div className="border-t border-gray-100 bg-amber-50 px-6 py-4">
                <p className="text-sm text-amber-700">
                  <strong>{preview.duplicateCount}</strong> returns have already been imported and will be skipped.
                  Re-importing the same file is safe.
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button onClick={handleReset} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={newReturns === 0 || importMutation.isPending}
              className="btn-primary disabled:opacity-50"
            >
              {importMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Importing…
                </span>
              ) : (
                `Import ${newReturns} Returns`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
