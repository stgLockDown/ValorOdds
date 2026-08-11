/**
 * Resend-backed transactional email.
 */
import { Resend } from 'resend';
import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __resend: Resend | undefined;
}

function getResend(): Resend {
  if (!global.__resend) {
    global.__resend = new Resend(env.resendApiKey());
  }
  return global.__resend;
}

export type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export async function sendEmail(payload: EmailPayload) {
  const apiKey = env.resendApiKey();
  if (!apiKey || apiKey.startsWith('__buildtime_placeholder')) {
    // eslint-disable-next-line no-console
    console.error('[email] RESEND_API_KEY is not configured — skipping send to', payload.to);
    return null;
  }
  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: env.resendFromEmail(),
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: payload.replyTo,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email] send failed', err);
    // Don't let email failures block the critical path (auth/checkout).
    return null;
  }
}

// ---------- Templates ----------

function baseTemplate(title: string, body: string, ctaUrl?: string, ctaLabel?: string): string {
  return `
  <!DOCTYPE html>
  <html><head><meta charset="utf-8"><title>${title}</title></head>
  <body style="margin:0;padding:0;background:#0a0e1a;font-family:Inter,Arial,sans-serif;color:#f9fafb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0e1a;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#111827;border:1px solid #374151;border-radius:16px;padding:32px;">
          <tr><td>
            <div style="font-size:24px;font-weight:800;margin-bottom:8px;">⚡ Valor Odds</div>
            <h1 style="font-size:22px;margin:16px 0 12px;color:#f9fafb;">${title}</h1>
            <div style="font-size:15px;line-height:1.6;color:#d1d5db;">${body}</div>
            ${
              ctaUrl && ctaLabel
                ? `<div style="margin-top:28px;"><a href="${ctaUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;">${ctaLabel}</a></div>`
                : ''
            }
            <hr style="border:0;border-top:1px solid #374151;margin:32px 0 16px;" />
            <div style="font-size:12px;color:#9ca3af;">
              You received this email from Valor Odds. If you didn't expect it, you can safely ignore it.
            </div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

export function welcomeEmail(displayName: string, appUrl: string) {
  return {
    subject: `Welcome to Valor Odds, ${displayName}!`,
    html: baseTemplate(
      `Welcome, ${displayName}! 🎉`,
      `Your account is ready. Log in to explore AI-powered arbitrage, player props, and your personalized dashboard.`,
      `${appUrl}/dashboard`,
      'Open Dashboard'
    ),
  };
}

export function verifyEmail(verifyUrl: string) {
  return {
    subject: 'Verify your email for Valor Odds',
    html: baseTemplate(
      'Confirm your email',
      `Click the button below to verify your email address. This link expires in 24 hours.`,
      verifyUrl,
      'Verify email'
    ),
  };
}

export function passwordResetEmail(resetUrl: string) {
  return {
    subject: 'Reset your Valor Odds password',
    html: baseTemplate(
      'Reset your password',
      `We received a request to reset your password. This link expires in 1 hour. If you didn't request this, ignore this email.`,
      resetUrl,
      'Reset password'
    ),
  };
}

export function purchaseReceiptEmail(opts: {
  tier: string;
  amountFormatted: string;
  periodEnd: string;
  manageUrl: string;
}) {
  return {
    subject: `Your Valor Odds ${opts.tier.toUpperCase()} subscription is active`,
    html: baseTemplate(
      `Welcome to ${opts.tier.toUpperCase()} 🚀`,
      `<p>Thank you for your purchase!</p>
       <ul style="line-height:1.8;">
         <li><strong>Plan:</strong> ${opts.tier.toUpperCase()}</li>
         <li><strong>Charged:</strong> ${opts.amountFormatted}</li>
         <li><strong>Renews:</strong> ${opts.periodEnd}</li>
       </ul>
       <p>Your Discord role has been updated automatically, and your dashboard now has full access.</p>`,
      opts.manageUrl,
      'Manage subscription'
    ),
  };
}

export function subscriptionCanceledEmail(effectiveUntil: string, resubscribeUrl: string) {
  return {
    subject: 'Your Valor Odds subscription has been canceled',
    html: baseTemplate(
      'Subscription canceled',
      `Your subscription will remain active until <strong>${effectiveUntil}</strong>. After that, your account will revert to the free tier. You can re-subscribe anytime.`,
      resubscribeUrl,
      'Resubscribe'
    ),
  };
}

export function paymentFailedEmail(updatePaymentUrl: string) {
  return {
    subject: 'Action needed: payment failed for Valor Odds',
    html: baseTemplate(
      'Payment failed',
      `Stripe was unable to process your most recent payment. Please update your payment method to keep your access active.`,
      updatePaymentUrl,
      'Update payment method'
    ),
  };
}