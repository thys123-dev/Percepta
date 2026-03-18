import { CheckCircle, AlertTriangle, MessageSquare } from 'lucide-react';

const STATUS_CONFIG: Record<string, { icon: React.ElementType; label: string; bg: string; text: string }> = {
  open: { icon: AlertTriangle, label: 'Open', bg: 'bg-amber-100', text: 'text-amber-700' },
  acknowledged: { icon: CheckCircle, label: 'Acknowledged', bg: 'bg-green-100', text: 'text-green-700' },
  disputed: { icon: MessageSquare, label: 'Disputed', bg: 'bg-red-100', text: 'text-red-700' },
};

interface Props {
  status: string;
  size?: 'sm' | 'md';
}

export function DiscrepancyStatusBadge({ status, size = 'sm' }: Props) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open!;
  const Icon = cfg.icon;
  const sizeClasses = size === 'md'
    ? 'px-3 py-1 text-sm'
    : 'px-2 py-0.5 text-xs';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses} ${cfg.bg} ${cfg.text}`}>
      <Icon className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
      {cfg.label}
    </span>
  );
}
