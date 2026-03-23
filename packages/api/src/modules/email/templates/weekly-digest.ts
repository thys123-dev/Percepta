/**
 * Weekly Digest Email Template
 *
 * Generates the HTML and plain-text versions of the Sunday weekly report.
 */

export interface WeeklyDigestData {
  sellerName: string;
  periodLabel: string; // e.g. "17–23 Mar 2026"
  summary: {
    totalRevenueCents: number;
    netProfitCents: number;
    profitMarginPct: number;
    orderCount: number;
    revenueDeltaPct: number | null;  // % change vs previous week (null = no prior data)
    profitDeltaPct: number | null;
  };
  topProducts: Array<{
    title: string;
    marginPct: number;
    netProfitCents: number;
    units: number;
  }>;
  bottomProducts: Array<{
    title: string;
    marginPct: number;
    netProfitCents: number;
    units: number;
  }>;
  alertsThisWeek: number;
  recommendation: {
    title: string;
    description: string;
    actionUrl: string;
  };
  dashboardUrl: string;
  unsubscribeUrl: string;
}

function rand(cents: number): string {
  return `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function deltaBadge(delta: number | null): string {
  if (delta === null) return '';
  const sign = delta >= 0 ? '+' : '';
  const color = delta >= 0 ? '#16a34a' : '#dc2626';
  return `<span style="color:${color};font-size:12px;margin-left:6px;">${sign}${delta.toFixed(1)}% vs last week</span>`;
}

function productRow(
  rank: number,
  p: { title: string; marginPct: number; netProfitCents: number; units: number },
  type: 'top' | 'bottom'
): string {
  const marginColor = p.marginPct >= 20 ? '#16a34a' : p.marginPct >= 0 ? '#d97706' : '#dc2626';
  const rankColor = type === 'top' ? '#16a34a' : '#dc2626';
  return `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <span style="display:inline-block;width:20px;height:20px;background:${rankColor};border-radius:50%;color:#fff;font-size:11px;font-weight:700;text-align:center;line-height:20px;margin-right:8px;">${rank}</span>
        <span style="font-size:13px;color:#374151;">${p.title}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">
        <span style="font-size:13px;font-weight:600;color:${marginColor};">${p.marginPct.toFixed(1)}%</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">
        <span style="font-size:13px;color:#6b7280;">${rand(p.netProfitCents)}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">
        <span style="font-size:13px;color:#6b7280;">${p.units} units</span>
      </td>
    </tr>`;
}

export function renderWeeklyDigestHtml(data: WeeklyDigestData): string {
  const { summary, topProducts, bottomProducts, recommendation } = data;

  const topRows = topProducts.map((p, i) => productRow(i + 1, p, 'top')).join('');
  const bottomRows = bottomProducts.map((p, i) => productRow(i + 1, p, 'bottom')).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Weekly Profit Report</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#1e40af;border-radius:12px 12px 0 0;padding:28px 32px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#fff;">Percepta</p>
            <p style="margin:4px 0 0;font-size:14px;color:#bfdbfe;">Weekly Profit Report · ${data.periodLabel}</p>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="background:#fff;padding:24px 32px 16px;">
            <p style="margin:0;font-size:15px;color:#374151;">Hi ${data.sellerName},</p>
            <p style="margin:8px 0 0;font-size:15px;color:#6b7280;">Here's how your Takealot store performed this week.</p>
          </td>
        </tr>

        <!-- Scorecard -->
        <tr>
          <td style="background:#fff;padding:0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:33%;padding:12px;background:#f0fdf4;border-radius:8px;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Revenue</p>
                  <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#111827;">${rand(summary.totalRevenueCents)}</p>
                  <p style="margin:2px 0 0;font-size:11px;">${deltaBadge(summary.revenueDeltaPct)}</p>
                </td>
                <td style="width:4%;"></td>
                <td style="width:33%;padding:12px;background:#eff6ff;border-radius:8px;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Net Profit</p>
                  <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#111827;">${rand(summary.netProfitCents)}</p>
                  <p style="margin:2px 0 0;font-size:11px;">${deltaBadge(summary.profitDeltaPct)}</p>
                </td>
                <td style="width:4%;"></td>
                <td style="width:26%;padding:12px;background:#fefce8;border-radius:8px;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Margin</p>
                  <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#111827;">${summary.profitMarginPct.toFixed(1)}%</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">${summary.orderCount} orders</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Top performers -->
        ${topProducts.length > 0 ? `
        <tr>
          <td style="background:#fff;padding:0 32px 20px;">
            <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#111827;">Top Performers</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f3f4f6;border-radius:8px;overflow:hidden;">
              <tr style="background:#f9fafb;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Product</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;">Margin</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;">Profit</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;">Units</th>
              </tr>
              ${topRows}
            </table>
          </td>
        </tr>` : ''}

        <!-- Bottom performers -->
        ${bottomProducts.length > 0 ? `
        <tr>
          <td style="background:#fff;padding:0 32px 20px;">
            <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#111827;">Needs Attention</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fee2e2;border-radius:8px;overflow:hidden;">
              <tr style="background:#fef2f2;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Product</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;">Margin</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;">Profit</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;">Units</th>
              </tr>
              ${bottomRows}
            </table>
          </td>
        </tr>` : ''}

        <!-- Alerts summary -->
        ${data.alertsThisWeek > 0 ? `
        <tr>
          <td style="background:#fff;padding:0 32px 20px;">
            <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;">
              <p style="margin:0;font-size:13px;color:#92400e;">
                <strong>${data.alertsThisWeek} alert${data.alertsThisWeek !== 1 ? 's' : ''}</strong> fired this week.
                <a href="${data.dashboardUrl}/alerts" style="color:#1e40af;margin-left:4px;">View all alerts →</a>
              </p>
            </div>
          </td>
        </tr>` : ''}

        <!-- One thing to fix -->
        <tr>
          <td style="background:#fff;padding:0 32px 28px;">
            <div style="background:#eff6ff;border-left:4px solid #1e40af;border-radius:0 8px 8px 0;padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#1e40af;text-transform:uppercase;letter-spacing:.5px;">One Thing to Fix This Week</p>
              <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#111827;">${recommendation.title}</p>
              <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">${recommendation.description}</p>
              <a href="${recommendation.actionUrl}" style="display:inline-block;background:#1e40af;color:#fff;font-size:13px;font-weight:600;padding:8px 18px;border-radius:6px;text-decoration:none;">Take Action →</a>
            </div>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="background:#fff;border-top:1px solid #f3f4f6;padding:20px 32px;text-align:center;">
            <a href="${data.dashboardUrl}" style="display:inline-block;background:#1e40af;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Open Full Dashboard</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              You're receiving this because you enabled weekly reports in Percepta.
              <a href="${data.unsubscribeUrl}" style="color:#6b7280;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderWeeklyDigestText(data: WeeklyDigestData): string {
  const { summary, topProducts, bottomProducts, recommendation } = data;
  const lines: string[] = [
    `Percepta — Weekly Profit Report (${data.periodLabel})`,
    `Hi ${data.sellerName},`,
    '',
    '── This Week ──────────────────────────',
    `Revenue:    ${rand(summary.totalRevenueCents)}`,
    `Net Profit: ${rand(summary.netProfitCents)}`,
    `Margin:     ${summary.profitMarginPct.toFixed(1)}%`,
    `Orders:     ${summary.orderCount}`,
    '',
  ];

  if (topProducts.length > 0) {
    lines.push('── Top Performers ──────────────────────');
    topProducts.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.title} — ${p.marginPct.toFixed(1)}% margin, ${rand(p.netProfitCents)} profit`);
    });
    lines.push('');
  }

  if (bottomProducts.length > 0) {
    lines.push('── Needs Attention ─────────────────────');
    bottomProducts.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.title} — ${p.marginPct.toFixed(1)}% margin, ${rand(p.netProfitCents)} profit`);
    });
    lines.push('');
  }

  if (data.alertsThisWeek > 0) {
    lines.push(`⚠ ${data.alertsThisWeek} alert(s) fired this week. Check your dashboard.`, '');
  }

  lines.push(
    '── One Thing to Fix ────────────────────',
    recommendation.title,
    recommendation.description,
    '',
    `Open dashboard: ${data.dashboardUrl}`,
    '',
    `Unsubscribe: ${data.unsubscribeUrl}`,
  );

  return lines.join('\n');
}
