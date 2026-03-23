import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Bell,
  PackageCheck,
  Scale,
  Settings,
  LogOut,
  TrendingUp,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useRealtimeUpdates } from '../../hooks/useRealtimeUpdates.js';
import { AlertBell } from '../alerts/AlertBell.js';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/dashboard/alerts', label: 'Alerts', icon: Bell },
  { path: '/dashboard/cogs', label: 'COGS', icon: PackageCheck },
  { path: '/dashboard/fee-audit', label: 'Fee Audit', icon: Scale },
  // Future: { path: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function DashboardLayout() {
  const location = useLocation();
  // Mount real-time update subscription for the entire dashboard session
  const { connected: wsConnected } = useRealtimeUpdates();

  const handleLogout = () => {
    localStorage.removeItem('percepta_token');
    localStorage.removeItem('percepta_refresh_token');
    window.location.href = '/login';
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar — desktop */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-gray-200 bg-white lg:block">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
            <TrendingUp className="h-6 w-6 text-brand-600" />
            <span className="text-xl font-bold text-brand-700">Percepta</span>
          </div>

          {/* Nav items */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Bottom */}
          <div className="border-t border-gray-200 p-3">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              <LogOut className="h-5 w-5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          {/* Mobile: logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <TrendingUp className="h-5 w-5 text-brand-600" />
            <span className="text-lg font-bold text-brand-700">Percepta</span>
          </div>

          <div className="hidden lg:block">
            <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
          </div>

          {/* Right side: notifications + settings */}
          <div className="flex items-center gap-3">
            {/* Real-time WebSocket indicator */}
            {wsConnected ? (
              <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                <Wifi className="h-3 w-3" />
                Live
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                <WifiOff className="h-3 w-3" />
                Offline
              </div>
            )}
            <AlertBell />
            <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700">
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 flex border-t border-gray-200 bg-white lg:hidden">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={clsx(
                'flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium',
                isActive ? 'text-brand-600' : 'text-gray-500'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
