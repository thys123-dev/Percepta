export function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Profitability Scorecard — Week 5 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Profitability Overview</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="metric-card">
            <span className="metric-label">Net Profit (30d)</span>
            <span className="metric-value text-profit-positive">—</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Total Revenue</span>
            <span className="metric-value">—</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Profit Margin</span>
            <span className="metric-value">—</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Loss-Making Products</span>
            <span className="metric-value text-profit-negative">—</span>
          </div>
        </div>
      </section>

      {/* Product Performance Table — Week 5 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Product Performance</h2>
        <div className="card overflow-hidden p-0">
          <div className="flex items-center justify-center py-20 text-gray-400">
            Connect your Takealot account to see product performance
          </div>
        </div>
      </section>
    </div>
  );
}
