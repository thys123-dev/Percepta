import { useState, useCallback } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import {
  useAccountTransactionImport,
  useAccountTransactionHistory,
} from '../../hooks/useAccountTransactions';
import { LastUploadBanner } from './LastUploadBanner';
import type {
  AccountTransactionPreview,
  AccountTransactionCommitResult,
} from '@percepta/shared';

interface Props {
  onImportComplete?: () => void;
}

/** Human-friendly labels for transaction type grouping. */
const TYPE_LABELS: Record<string, string> = {
  'Customer Order Payment': 'Order Payments',
  'Success Fee Charge': 'Success Fees',
  'Fulfilment Fee Charge': 'Fulfilment Fees',
  'Stock Transfer Fee Charge': 'Stock Transfer (IBT)',
  'Storage Fee Charge': 'Storage Fees',
  'Customer Order Reversal': 'Return Reversals',
  'Success Fee Reversal': 'Success Fee Reversals',
  'Fulfilment Fee Reversal': 'Fulfilment Fee Reversals',
  'Order Cancellation Penalty': 'Cancellation Penalties',
  'Stock Loss Fulfilment Fee': 'Stock Loss (Fulfilment)',
  'Stock Loss Success Fee': 'Stock Loss (Success)',
  'Stock Loss Payment': 'Stock Loss Compensation',
  'Returns Removal Order Fee': 'Returns Removal Fees',
  'Takealot Removal Order Fee': 'Removal Order Fees',
  'Subscription Fee Charge': 'Subscription Fees',
  'Ad Credit Purchase': 'Ad Spend',
  'Disbursement': 'Disbursements',
};

export function AccountTransactionUpload({ onImportComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string>('');
  const [preview, setPreview] = useState<AccountTransactionPreview | null>(null);
  const [commitResult, setCommitResult] = useState<AccountTransactionCommitResult | null>(null);

  const importMutation = useAccountTransactionImport();
  const { data: history, isLoading: historyLoading } = useAccountTransactionHistory();
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
      importMutation.mutate(
        { mode: 'preview', csvText: text, fileName: f.name },
        {
          onSuccess: (result) => {
            if (result.mode === 'preview') setPreview(result as AccountTransactionPreview);
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
            setCommitResult(result as AccountTransactionCommitResult);
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

  const formatRands = (cents: number) =>
    `R${(Math.abs(cents) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  const newTransactions = preview
    ? preview.parsed.totalRows - preview.duplicateCount
    : 0;

  // ── Success state ──
  if (commitResult) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
        <h3 className="mt-4 text-lg font-semibold text-green-900">Import Complete</h3>
        <p className="mt-2 text-sm text-green-700">
          Imported <strong>{commitResult.inserted}</strong> transactions.
          {commitResult.duplicatesSkipped > 0 && (
            <span className="block mt-1 text-green-600">
              {commitResult.duplicatesSkipped} duplicate transactions were skipped.
            </span>
          )}
          {commitResult.ordersUpdated > 0 && (
            <span className="block mt-1 text-green-600">
              {commitResult.ordersUpdated} orders updated with reversal data.
            </span>
          )}
        </p>
        <p className="mt-2 text-xs text-green-600">
          Non-order costs have been aggregated. Profit recalculation queued for affected orders.
        </p>
        <button onClick={handleReset} className="btn-secondary mt-6">
          Import Another Statement
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Last upload status */}
      <LastUploadBanner
        label="Account Transactions"
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
        primaryCountLabel="transactions imported"
        secondaryCountLabel="duplicates skipped"
      />

      {/* Info banner */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
        <h3 className="text-sm font-medium text-blue-900">Why import your account transactions?</h3>
        <ul className="mt-2 text-sm text-blue-700 list-disc list-inside space-y-1">
          <li>See the financial impact of returns (order reversals and fee refunds)</li>
          <li>Track stock losses, removal fees, and cancellation penalties</li>
          <li>Capture monthly subscription fees and ad spend as overhead costs</li>
          <li>Get actual storage fee amounts (not just estimates)</li>
          <li>View disbursement (payout) history</li>
        </ul>
        <p className="mt-2 text-xs text-blue-600">
          Download your CSV from: Takealot Seller Portal &rarr; Payments &rarr; Account Transactions &rarr; Export
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
            Drop your Account Transactions CSV here
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
                    {preview.parsed.totalRows} transactions parsed
                    {preview.parsed.parseErrors > 0 && (
                      <span className="text-amber-600"> &middot; {preview.parsed.parseErrors} errors</span>
                    )}
                    {preview.dateRange && (
                      <span className="text-gray-400">
                        {' '}&middot; {new Date(preview.dateRange.earliest).toLocaleDateString()} &ndash;{' '}
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
                <p className="text-2xl font-bold text-blue-600">{newTransactions}</p>
                <p className="text-xs text-gray-500">New transactions</p>
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
                <p className="text-2xl font-bold text-amber-600">{preview.orderLinked.unmatchedOrders}</p>
                <p className="text-xs text-gray-500">Orders not found</p>
              </div>
            </div>

            {/* Breakdown by transaction type */}
            <div className="border-t border-gray-100 px-6 py-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Transaction Breakdown</h4>
              <div className="space-y-2">
                {Object.entries(preview.byType)
                  .sort(([, a], [, b]) => (b as { count: number }).count - (a as { count: number }).count)
                  .map(([type, rawData]) => {
                    const data = rawData as { count: number; totalInclVatCents: number };
                    return (
                    <div key={type} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">{TYPE_LABELS[type] ?? type}</span>
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                          {data.count}
                        </span>
                      </div>
                      <span className={`text-sm font-medium ${data.totalInclVatCents < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {data.totalInclVatCents < 0 ? '-' : '+'}{formatRands(data.totalInclVatCents)}
                      </span>
                    </div>
                    );
                  })}
              </div>
            </div>

            {/* Non-order costs summary */}
            {preview.nonOrder.count > 0 && (
              <div className="border-t border-gray-100 px-6 py-4">
                <h4 className="text-sm font-medium text-gray-900 mb-1">Overhead Costs</h4>
                <p className="text-xs text-gray-500 mb-2">
                  These {preview.nonOrder.count} transactions represent business costs not tied to specific orders.
                </p>
                <p className="text-lg font-bold text-red-600">
                  {formatRands(preview.nonOrder.totalInclVatCents)} incl. VAT
                </p>
              </div>
            )}

            {/* Disbursements */}
            {preview.disbursements.count > 0 && (
              <div className="border-t border-gray-100 px-6 py-4">
                <h4 className="text-sm font-medium text-gray-900 mb-1">Disbursements</h4>
                <p className="text-sm text-gray-600">
                  {preview.disbursements.count} payout(s) totalling{' '}
                  <span className="font-semibold">{formatRands(preview.disbursements.totalInclVatCents)}</span>
                </p>
              </div>
            )}

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

            {/* Duplicate warning */}
            {preview.duplicateCount > 0 && (
              <div className="border-t border-gray-100 px-6 py-4 bg-amber-50">
                <p className="text-sm text-amber-700">
                  <strong>{preview.duplicateCount}</strong> transactions have already been imported and will be skipped.
                  Re-importing the same CSV is safe.
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button onClick={handleReset} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={newTransactions === 0 || importMutation.isPending}
              className="btn-primary disabled:opacity-50"
            >
              {importMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Importing...
                </span>
              ) : (
                `Import ${newTransactions} Transactions`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
