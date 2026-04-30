import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DashboardLayout } from './components/layout/DashboardLayout';

// Eagerly loaded — tiny pages that gate authentication
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

// Lazily loaded — heavy pages only loaded when navigated to
const DashboardPage    = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const AlertsPage       = lazy(() => import('./pages/AlertsPage').then((m) => ({ default: m.AlertsPage })));
const CogsPage         = lazy(() => import('./pages/CogsPage').then((m) => ({ default: m.CogsPage })));
const ReportUploadPage = lazy(() => import('./pages/ReportUploadPage').then((m) => ({ default: m.ReportUploadPage })));
const FeesInsightsPage = lazy(() => import('./pages/FeesInsightsPage').then((m) => ({ default: m.FeesInsightsPage })));
const InventoryPage    = lazy(() => import('./pages/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const OnboardingPage   = lazy(() => import('./pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    </div>
  );
}

/**
 * The /dashboard/fee-audit page was split into Report Upload (data import)
 * and Fees & Insights (analysis). Preserve old deep links by mapping each
 * tab key to the page that now owns it.
 */
const FEE_AUDIT_TAB_TO_PAGE: Record<string, string> = {
  upload: '/dashboard/report-upload?tab=upload',
  'acct-transactions': '/dashboard/report-upload?tab=acct-transactions',
  'returns-import': '/dashboard/report-upload?tab=returns-import',
  history: '/dashboard/report-upload?tab=history',
  discrepancies: '/dashboard/fees-insights?tab=discrepancies',
  'by-product': '/dashboard/fees-insights?tab=by-product',
  insights: '/dashboard/fees-insights?tab=insights',
};

function LegacyFeeAuditRedirect() {
  const [params] = useSearchParams();
  const requested = params.get('tab');
  const target = (requested && FEE_AUDIT_TAB_TO_PAGE[requested]) ?? '/dashboard/report-upload';
  return <Navigate to={target} replace />;
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Auth routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
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
            path="inventory"
            element={
              <Suspense fallback={<PageLoader />}>
                <InventoryPage />
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
            path="report-upload"
            element={
              <Suspense fallback={<PageLoader />}>
                <ReportUploadPage />
              </Suspense>
            }
          />
          <Route
            path="fees-insights"
            element={
              <Suspense fallback={<PageLoader />}>
                <FeesInsightsPage />
              </Suspense>
            }
          />
          {/* Legacy URL — preserve any bookmarked /dashboard/fee-audit?tab=... link */}
          <Route path="fee-audit" element={<LegacyFeeAuditRedirect />} />
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
