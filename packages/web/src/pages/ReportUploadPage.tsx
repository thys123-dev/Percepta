import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SalesReportUpload } from '../components/fees/SalesReportUpload';
import { AccountTransactionUpload } from '../components/fees/AccountTransactionUpload';
import { ReturnsImportUpload } from '../components/fees/ReturnsImportUpload';
import { ImportHistoryList } from '../components/fees/ImportHistoryList';
import { AccountTransactionHistory } from '../components/fees/AccountTransactionHistory';
import { ReturnsImportHistory } from '../components/fees/ReturnsImportHistory';

type Tab = 'upload' | 'acct-transactions' | 'returns-import' | 'history';

const VALID_TABS: readonly Tab[] = [
  'upload',
  'acct-transactions',
  'returns-import',
  'history',
];

/**
 * Report Upload page — the inbox for every Takealot CSV/XLSX a seller imports.
 *
 * The analytical views (Fee Discrepancies, By Product, Insights) used to live
 * here too but moved to /dashboard/fees-insights so importing data and
 * reviewing it stay separate concerns.
 */
export function ReportUploadPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialTab = (() => {
    const requested = searchParams.get('tab');
    return requested && (VALID_TABS as readonly string[]).includes(requested)
      ? (requested as Tab)
      : 'upload';
  })();

  const [tab, setTab] = useState<Tab>(initialTab);

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'upload', label: 'Sales Report' },
    { key: 'acct-transactions', label: 'Account Transactions' },
    { key: 'returns-import', label: 'Returns Export' },
    { key: 'history', label: 'Import History' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Report Upload</h1>
        <p className="mt-1 text-sm text-gray-500">
          Import the Takealot reports that aren't available via the API: Sales Report, Account
          Transactions, and the Returns Export.
        </p>
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
      {tab === 'upload' && (
        <SalesReportUpload
          // After a successful Sales Report commit, jump to the Fees & Insights
          // page so the seller can immediately see the discrepancies.
          onImportComplete={() => navigate('/dashboard/fees-insights?tab=discrepancies')}
        />
      )}
      {tab === 'acct-transactions' && <AccountTransactionUpload />}
      {tab === 'returns-import' && <ReturnsImportUpload />}
      {tab === 'history' && (
        <div className="space-y-8">
          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-700">Sales Report Imports</h3>
            <ImportHistoryList />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-700">Account Transaction Imports</h3>
            <AccountTransactionHistory />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-700">Returns Export Imports</h3>
            <ReturnsImportHistory />
          </div>
        </div>
      )}
    </div>
  );
}
