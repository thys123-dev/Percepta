import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Loader2 } from 'lucide-react';
import { SalesReportUpload } from '../components/fees/SalesReportUpload';
import { AccountTransactionUpload } from '../components/fees/AccountTransactionUpload';
import { ReturnsImportUpload } from '../components/fees/ReturnsImportUpload';
import { FeeDiscrepancyTable } from '../components/fees/FeeDiscrepancyTable';
import { ImportHistoryList } from '../components/fees/ImportHistoryList';
import { AccountTransactionHistory } from '../components/fees/AccountTransactionHistory';
import { ProductDiscrepancyTable } from '../components/fees/ProductDiscrepancyTable';
import { DiscrepancyCharts } from '../components/fees/DiscrepancyCharts';
import { useExportDiscrepancies } from '../hooks/useSalesReport';

type Tab =
  | 'upload'
  | 'acct-transactions'
  | 'returns-import'
  | 'discrepancies'
  | 'by-product'
  | 'insights'
  | 'history';

const VALID_TABS: readonly Tab[] = [
  'upload',
  'acct-transactions',
  'returns-import',
  'discrepancies',
  'by-product',
  'insights',
  'history',
];

export function FeeAuditPage() {
  const [searchParams] = useSearchParams();
  const initialTab = (() => {
    const requested = searchParams.get('tab');
    return requested && (VALID_TABS as readonly string[]).includes(requested)
      ? (requested as Tab)
      : 'upload';
  })();

  const [tab, setTab] = useState<Tab>(initialTab);
  const exportMutation = useExportDiscrepancies();

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'upload', label: 'Sales Report' },
    { key: 'acct-transactions', label: 'Account Transactions' },
    { key: 'returns-import', label: 'Returns Export' },
    { key: 'discrepancies', label: 'Fee Discrepancies' },
    { key: 'by-product', label: 'By Product' },
    { key: 'insights', label: 'Insights' },
    { key: 'history', label: 'Import History' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fee Audit</h1>
          <p className="mt-1 text-sm text-gray-500">
            Import your Takealot reports to compare fees, track reversals, and see your complete financial picture.
          </p>
        </div>

        {/* Export button — visible when on discrepancies, by-product, or insights tabs */}
        {(tab === 'discrepancies' || tab === 'by-product' || tab === 'insights') && (
          <button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {exportMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </button>
        )}
      </div>

      {/* Tab navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === 'upload' && <SalesReportUpload onImportComplete={() => setTab('discrepancies')} />}
      {tab === 'acct-transactions' && <AccountTransactionUpload />}
      {tab === 'returns-import' && <ReturnsImportUpload />}
      {tab === 'discrepancies' && <FeeDiscrepancyTable />}
      {tab === 'by-product' && <ProductDiscrepancyTable />}
      {tab === 'insights' && <DiscrepancyCharts />}
      {tab === 'history' && (
        <div className="space-y-8">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Sales Report Imports</h3>
            <ImportHistoryList />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Account Transaction Imports</h3>
            <AccountTransactionHistory />
          </div>
        </div>
      )}
    </div>
  );
}
