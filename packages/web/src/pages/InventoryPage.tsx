/**
 * InventoryPage — /dashboard/inventory
 *
 * Stock management page with two tabs:
 *   Stock Levels — per-DC stock, cover days, sales velocity
 *   Returns      — reversed orders with amounts
 */

import { useState } from 'react';
import { Warehouse, RotateCcw, Download, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { StockTable } from '../components/inventory/StockTable.js';
import { ReturnsTable } from '../components/inventory/ReturnsTable.js';
import { exportInventoryCsv } from '../hooks/useInventory.js';

type Tab = 'stock' | 'returns';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'stock', label: 'Stock Levels', icon: Warehouse },
  { id: 'returns', label: 'Returns', icon: RotateCcw },
];

export function InventoryPage() {
  const [activeTab, setActiveTab] = useState<Tab>('stock');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportInventoryCsv();
    } catch (err) {
      console.error('CSV export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Stock levels across Takealot DCs, sales velocity, and return tracking.
          </p>
        </div>

        {activeTab === 'stock' && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </button>
        )}
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
      {activeTab === 'stock' && <StockTable />}
      {activeTab === 'returns' && <ReturnsTable />}
    </div>
  );
}
