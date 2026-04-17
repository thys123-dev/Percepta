/**
 * Password Reset Email Template
 *
 * Sent when a user requests a password reset via /api/auth/forgot-password.
 * Includes a unique link with the reset token. The token is single-use and
 * expires after 1 hour.
 */

interface PasswordResetEmailParams {
  resetUrl: string;
  businessName: string | null;
  expiresInMinutes: number;
}

export function passwordResetEmailHtml(params: PasswordResetEmailParams): string {
  const { resetUrl, businessName, expiresInMinutes } = params;
  const greeting = businessName ? `Hi ${escapeHtml(businessName)},` : 'Hi,';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Reset your Percepta password</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;max-width:560px;">
          <tr>
            <td>
              <h1 style="margin:0 0 8px;font-size:22px;color:#0f766e;">Percepta</h1>
              <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Real-time profit intelligence for Takealot sellers</p>

              <h2 style="margin:0 0 16px;font-size:18px;">Reset your password</h2>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">${greeting}</p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">
                We received a request to reset the password on your Percepta account.
                Click the button below to choose a new password. This link is valid for the next
                <strong>${expiresInMinutes} minutes</strong>.
              </p>

              <p style="margin:24px 0;text-align:center;">
                <a href="${resetUrl}"
                   style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">
                  Reset password
                </a>
              </p>

              <p style="margin:0 0 16px;font-size:13px;color:#6b7280;line-height:1.5;">
                Or copy and paste this URL into your browser:<br />
                <a href="${resetUrl}" style="color:#0f766e;word-break:break-all;">${resetUrl}</a>
              </p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />

              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
                If you didn't request a password reset, you can safely ignore this email —
                your password won't be changed. For security, this link can only be used once.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function passwordResetEmailText(params: PasswordResetEmailParams): string {
  const { resetUrl, businessName, expiresInMinutes } = params;
  const greeting = businessName ? `Hi ${businessName},` : 'Hi,';

  return `${greeting}

We received a request to reset the password on your Percepta account.
Click the link below to choose a new password. This link is valid for ${expiresInMinutes} minutes.

${resetUrl}

If you didn't request a password reset, you can safely ignore this email — your password won't be changed. For security, this link can only be used once.

— Percepta`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
