import { env, isRealSecret } from './env';

const BRAND = 'Regularity Race Timer';

/**
 * Send a transactional email via Resend's HTTP API (no SDK dependency).
 * When RESEND_API_KEY isn't set, the email is logged instead of sent so the
 * flow stays testable locally — mirrors how social providers degrade without
 * real credentials. Throwing on a real send failure is fine: callers run inside
 * BetterAuth's background email task, so it never blocks the request.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  if (!isRealSecret(env.RESEND_API_KEY)) {
    console.log(`[email] RESEND_API_KEY not set — would send to ${opts.to}: "${opts.subject}"`);
    if (opts.text) console.log(`[email] body:\n${opts.text}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      ...(opts.text ? { text: opts.text } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend send failed (${res.status}): ${body}`);
  }
}

/** Password-reset email. `url` is the BetterAuth reset link (valid ~1 hour). */
export async function sendResetPasswordEmail(to: string, url: string): Promise<void> {
  const html = `<!doctype html><html><body style="margin:0;background:#0b0f17;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f17;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;background:#121723;border:1px solid #1f2937;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:28px 28px 8px;">
          <div style="color:#38bdf8;font-size:12px;letter-spacing:2px;font-weight:700;">REGULARITY</div>
          <div style="color:#f8fafc;font-size:22px;font-weight:800;margin-top:2px;">Reset your password</div>
        </td></tr>
        <tr><td style="padding:8px 28px 4px;color:#cbd5e1;font-size:15px;line-height:1.5;">
          We received a request to reset your ${BRAND} password. Tap the button below to choose a new one. This link expires in 1 hour.
        </td></tr>
        <tr><td style="padding:20px 28px;">
          <a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:10px;">Reset password</a>
        </td></tr>
        <tr><td style="padding:0 28px 24px;color:#64748b;font-size:13px;line-height:1.5;">
          If you didn't request this, you can safely ignore this email — your password won't change.
          <br/><br/>Or paste this link into your browser:<br/>
          <span style="color:#38bdf8;word-break:break-all;">${url}</span>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
  const text = `Reset your ${BRAND} password (this link expires in 1 hour):\n${url}\n\nIf you didn't request this, you can ignore this email.`;
  await sendEmail({ to, subject: `Reset your ${BRAND} password`, html, text });
}
