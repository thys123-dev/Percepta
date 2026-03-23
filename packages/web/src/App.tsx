import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DashboardLayout } from './components/layout/DashboardLayout';

// Eagerly loaded — tiny pages that gate authentication
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

// Lazily loaded — heavy pages only loaded when navigated to
const DashboardPage    = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const AlertsPage       = lazy(() => import('./pages/AlertsPage').then((m) => ({ default: m.AlertsPage })));
const CogsPage         = lazy(() => import('./pages/CogsPage').then((m) => ({ default: m.CogsPage })));
const FeeAuditPage     = lazy(() => import('./pages/FeeAuditPage').then((m) => ({ default: m.FeeAuditPage })));
const OnboardingPage   = lazy(() => import('./pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Auth routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/onboarding"
          element={
            <Suspense fallback={<PageLoader />}>
              <OnboardingPage />
            </Suspense>
          }
        />

        {/* Dashboard routes (protected) */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route
            index
            element={
              <Suspense fallback={<PageLoader />}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route
            path="alerts"
            element={
              <Suspense fallback={<PageLoader />}>
                <AlertsPage />
              </Suspense>
            }
          />
          <Route
            path="cogs"
            element={
              <Suspense fallback={<PageLoader />}>
                <CogsPage />
              </Suspense>
            }
          />
          <Route
            path="fee-audit"
            element={
              <Suspense fallback={<PageLoader />}>
                <FeeAuditPage />
              </Suspense>
            }
          />
          <Route
            path="notifications"
            element={
              <Suspense fallback={<PageLoader />}>
                <NotificationsPage />
              </Suspense>
            }
          />
        </Route>

        {/* Redirect root to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
