import { useState } from 'react';
import { CheckCircle, MessageSquare, Loader2, X } from 'lucide-react';

interface Props {
  discrepancyId: string;
  currentStatus: string;
  onSubmit: (status: 'acknowledged' | 'disputed', note?: string) => void;
  isPending?: boolean;
  onClose: () => void;
}

export function DiscrepancyActionDialog({ discrepancyId, currentStatus, onSubmit, isPending, onClose }: Props) {
  const [note, setNote] = useState('');
  const [action, setAction] = useState<'acknowledged' | 'disputed' | null>(null);

  function handleSubmit(status: 'acknowledged' | 'disputed') {
    setAction(status);
    onSubmit(status, note.trim() || undefined);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-900">Resolve Discrepancy</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)..."
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        rows={2}
        maxLength={500}
      />

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => handleSubmit('acknowledged')}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {isPending && action === 'acknowledged' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle className="h-3.5 w-3.5" />
          )}
          Acknowledge
        </button>
        <button
          onClick={() => handleSubmit('disputed')}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isPending && action === 'disputed' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageSquare className="h-3.5 w-3.5" />
          )}
          Dispute
        </button>
      </div>
    </div>
  );
}
