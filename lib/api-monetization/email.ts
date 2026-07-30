/**
 * Transactional email for the API monetization platform. Uses the same
 * sendEmail() transport as lib/email.ts but keeps its own small template
 * (baseTemplate there isn't exported, and this content is different enough
 * — a one-time-reveal API key — to warrant its own careful copy).
 */
import type { EmailPayload } from '@/lib/email';

export function apiKeyIssuedEmail(opts: { rawKey: string; manageUrl: string }): Omit<EmailPayload, 'to'> {
  const { rawKey, manageUrl } = opts;
  return {
    subject: 'Your Valor Odds API key is ready',
    html: `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>Your API key</title></head>
    <body style="margin:0;padding:0;background:#0a0e1a;font-family:Inter,Arial,sans-serif;color:#f9fafb;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0e1a;padding:40px 16px;">
        <tr><td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#111827;border:1px solid #374151;border-radius:16px;padding:32px;">
            <tr><td>
              <div style="font-size:24px;font-weight:800;margin-bottom:8px;">⚡ Valor Odds API</div>
              <h1 style="font-size:22px;margin:16px 0 12px;color:#f9fafb;">Your API key is ready</h1>
              <p style="color:#9ca3af;font-size:14px;line-height:1.6;">
                Thanks for subscribing. Here is your API key — save it now, as we
                only show it once for security. If you lose it, you can generate a
                new one (which will deactivate this one) from your API dashboard.
              </p>
              <div style="margin:20px 0;padding:16px;background:#0a0e1a;border:1px solid #374151;border-radius:8px;font-family:monospace;font-size:13px;word-break:break-all;color:#22d3ee;">
                ${rawKey}
              </div>
              <a href="${manageUrl}" style="display:inline-block;margin-top:12px;padding:12px 24px;background:#22d3ee;color:#0a0e1a;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px;">
                Go to API dashboard
              </a>
              <p style="color:#6b7280;font-size:12px;margin-top:24px;">
                Keep this key secret. Anyone with it can make calls against your quota.
              </p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>`,
    text: `Your Valor Odds API key: ${rawKey}\n\nSave it now — we only show it once. Manage your plan: ${manageUrl}`,
  };
}
