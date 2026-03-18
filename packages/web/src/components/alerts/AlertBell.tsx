/**
 * AlertBell
 *
 * Notification bell icon for the top nav bar. Shows an unread count badge.
 * Clicking navigates to the /dashboard/alerts page.
 */

import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useUnreadCount } from '../../hooks/useAlerts.js';

export function AlertBell() {
  const { data } = useUnreadCount();
  const count = data?.count ?? 0;

  return (
    <Link
      to="/dashboard/alerts"
      className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
      aria-label={count > 0 ? `${count} unread alerts` : 'Alerts'}
    >
      <Bell className="h-5 w-5" />

      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
