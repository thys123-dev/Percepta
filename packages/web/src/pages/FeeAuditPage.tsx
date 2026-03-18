import { useState } from 'react';
import { SalesReportUpload } from '../components/fees/SalesReportUpload';
import { FeeDiscrepancyTable } from '../components/fees/FeeDiscrepancyTable';
import { ImportHistoryList } from '../components/fees/ImportHistoryList';

type Tab = 'upload' | 'discrepancies' | 'history';

export function FeeAuditPage() {
  const [tab, setTab] = useState<Tab>('upload');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'upload', label: 'Import Sales Report' },
    { key: 'discrepancies', label: 'Fee Discrepancies' },
    { key: 'history', label: 'Import History' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Fee Audit</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload your Takealot sales report CSV to compare actual fees against calculated estimates and identify overcharges.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
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
      {tab === 'discrepancies' && <FeeDiscrepancyTable />}
      {tab === 'history' && <ImportHistoryList />}
    </div>
  );
}
