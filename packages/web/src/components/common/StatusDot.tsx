/**
 * StatusDot — small coloured circle that visualises a Takealot offer status.
 *
 * Colour mapping:
 *   green  → Buyable
 *   amber  → Not Buyable
 *   grey   → Disabled by Seller / Disabled by Takealot / anything else "disabled"
 *   (none) → unknown / null status (returns null so layout stays clean)
 *
 * The native title attribute shows the exact status string on hover so a
 * curious user gets the full "Disabled by Seller" text.
 */

import { clsx } from 'clsx';

interface StatusDotProps {
  status: string | null;
  /** Extra classes for layout (e.g. 'mr-2'). */
  className?: string;
}

type Category = 'buyable' | 'not_buyable' | 'disabled';

function categorise(status: string | null): Category | null {
  if (!status) return null;
  if (/^buyable$/i.test(status.trim())) return 'buyable';
  if (/^not\s+buyable$/i.test(status.trim())) return 'not_buyable';
  if (/disabled/i.test(status)) return 'disabled';
  return null;
}

const STYLES: Record<Category, { color: string; label: string }> = {
  buyable:     { color: 'bg-green-500',  label: 'Buyable' },
  not_buyable: { color: 'bg-amber-500',  label: 'Not Buyable' },
  disabled:    { color: 'bg-gray-400',   label: 'Disabled' },
};

export function StatusDot({ status, className }: StatusDotProps) {
  const cat = categorise(status);
  if (!cat) return null;
  const { color, label } = STYLES[cat];
  return (
    <span
      className={clsx('inline-block h-2 w-2 flex-shrink-0 rounded-full', color, className)}
      title={status ?? label}
      aria-label={label}
    />
  );
}
