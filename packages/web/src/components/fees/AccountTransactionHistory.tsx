import { FileText, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { useAccountTransactionHistory } from '../../hooks/useAccountTransactions';

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  complete: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
  processing: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100' },
  pending: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100' },
};

export function AccountTransactionHistory() {
  const { data: imports, isLoading } = useAccountTransactionHistory();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white p-12">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
        <span className="text-sm text-gray-500">Loading import history...</span>
      </div>
    );
  }

  if (!imports || imports.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <FileText className="mx-auto h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">No Account Transaction Imports Yet</h3>
        <p className="mt-2 text-sm text-gray-500">
          Upload your first Takealot Account Transactions CSV to track reversals, overhead costs, and more.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              File
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Rows
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Inserted
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Duplicates
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Orders Updated
            </th>
            <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
              Status
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Date
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {imports.map((imp) => {
            const cfg = STATUS_CONFIG[imp.status] ?? STATUS_CONFIG.pending!;
            const Icon = cfg.icon;
            return (
              <tr key={imp.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <div>
                      <span className="text-sm font-medium text-gray-900">{imp.fileName}</span>
                      {imp.dateRangeStart && imp.dateRangeEnd && (
                        <p className="text-xs text-gray-400">
                          {new Date(imp.dateRangeStart).toLocaleDateString()} &ndash;{' '}
                          {new Date(imp.dateRangeEnd).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-700">
                  {imp.rowCount}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-700">
                  {imp.insertedCount}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-700">
                  {imp.duplicateCount}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-700">
                  {imp.ordersUpdated}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-center">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {imp.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-500">
                  {new Date(imp.createdAt).toLocaleDateString()}{' '}
                  <span className="text-gray-400">{new Date(imp.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
