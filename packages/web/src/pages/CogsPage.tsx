/**
 * CogsPage — /dashboard/cogs
 *
 * Full COGS management page with two tabs:
 *   Products   — inline-editable offer list (CogsTable)
 *   CSV Import — upload and preview a CSV bulk import (CogsCsvImport)
 */

import { useState } from 'react';
import { PackageCheck, Upload, Info } from 'lucide-react';
import { clsx } from 'clsx';
import { CogsTable } from '../components/cogs/CogsTable.js';
import { CogsCsvImport } from '../components/cogs/CogsCsvImport.js';

type Tab = 'products' | 'import';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'products', label: 'Products', icon: PackageCheck },
  { id: 'import', label: 'CSV Import', icon: Upload },
];

export function CogsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('products');

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cost of Goods (COGS)</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Set your cost of goods to unlock accurate net profit and margin calculations.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
        <div>
          <strong>Why COGS matters: </strong>
          Without your product cost, Percepta estimates profit using 30% of the selling price.
          Adding your real COGS ensures every margin number is accurate.
          Updates trigger a profit recalculation within seconds.
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={clsx(
                'flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors',
                activeTab === id
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'products' && <CogsTable />}
      {activeTab === 'import' && (
        <div className="mx-auto max-w-2xl">
          <CogsCsvImport />
        </div>
      )}
    </div>
  );
}
