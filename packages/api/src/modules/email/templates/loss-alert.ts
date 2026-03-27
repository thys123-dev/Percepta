/**
 * Loss Alert Email Template
 *
 * Sent in real-time when a product margin drops below the seller's
 * configured threshold, or when a loss-maker sale is detected.
 */

export type LossAlertType = 'loss_maker' | 'margin_drop';

export interface LossAlertData {
  sellerName: string;
  alertType: LossAlertType;
  productTitle: string;
  currentMarginPct: number;
  netProfitCents: number;
  thresholdPct?: number;       // for margin_drop: the configured threshold
  previousMarginPct?: number;  // for margin_drop: the 7-day average margin
  dashboardUrl: string;
  unsubscribeUrl: string;
}

function rand(cents: number): string {
  return `R${(Math.abs(cents) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function renderLossAlertHtml(data: LossAlertData): string {
  const isLossMaker = data.alertType === 'loss_maker';
  const accentColor = isLossMaker ? '#dc2626' : '#d97706';
  const bgColor = isLossMaker ? '#fef2f2' : '#fffbeb';
  const borderColor = isLossMaker ? '#dc2626' : '#d97706';

  const heading = isLossMaker
    ? `Loss-Maker Alert: ${data.productTitle}`
    : `Margin Drop Alert: ${data.productTitle}`;

  const bodyText = isLossMaker
    ? `<strong>${data.productTitle}</strong> just lost ${rand(Math.abs(data.netProfitCents))} on a sale (margin: ${data.currentMarginPct.toFixed(1)}%). Without intervention, you'll continue losing money on every unit sold.`
    : `<strong>${data.productTitle}</strong> margin dropped from ${data.previousMarginPct?.toFixed(1) ?? '?'}% to ${data.currentMarginPct.toFixed(1)}% — below your ${data.thresholdPct?.toFixed(0) ?? '?'}% alert threshold.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:${accentColor};border-radius:12px 12px 0 0;padding:22px 28px;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">Percepta Alert</p>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Real-time profit monitoring</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#fff;padding:28px;">
            <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${data.sellerName},</p>

            <div style="background:${bgColor};border-left:4px solid ${borderColor};border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:20px;">
              <p style="margin:0 0 6px;font-size:16px;font-weight:600;color:#111827;">${heading}</p>
              <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.5;">${bodyText}</p>
            </div>

            <!-- Stats -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="width:50%;padding:12px;background:#f9fafb;border-radius:8px;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;">Current Margin</p>
                  <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:${accentColor};">${data.currentMarginPct.toFixed(1)}%</p>
                </td>
                <td style="width:4%;"></td>
                <td style="width:46%;padding:12px;background:#f9fafb;border-radius:8px;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;">${isLossMaker ? 'Loss per Sale' : 'Net Profit'}</p>
                  <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:${accentColor};">${isLossMaker ? '-' : ''}${rand(data.netProfitCents)}</p>
                </td>
              </tr>
            </table>

            <a href="${data.dashboardUrl}" style="display:block;background:${accentColor};color:#fff;font-size:14px;font-weight:600;padding:12px;border-radius:8px;text-decoration:none;text-align:center;">Review on Dashboard →</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-radius:0 0 12px 12px;padding:16px 28px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Real-time alerts by Percepta ·
              <a href="${data.unsubscribeUrl}" style="color:#6b7280;">Manage preferences</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderLossAlertText(data: LossAlertData): string {
  const heading = data.alertType === 'loss_maker'
    ? `LOSS-MAKER ALERT: ${data.productTitle}`
    : `MARGIN DROP ALERT: ${data.productTitle}`;

  const detail = data.alertType === 'loss_maker'
    ? `Current margin: ${data.currentMarginPct.toFixed(1)}%  |  Loss per sale: -${rand(Math.abs(data.netProfitCents))}`
    : `Margin: ${data.previousMarginPct?.toFixed(1) ?? '?'}% → ${data.currentMarginPct.toFixed(1)}%  (threshold: ${data.thresholdPct?.toFixed(0) ?? '?'}%)`;

  return [
    `Percepta Alert`,
    heading,
    '',
    detail,
    '',
    `Review on dashboard: ${data.dashboardUrl}`,
    `Manage preferences: ${data.unsubscribeUrl}`,
  ].join('\n');
}
