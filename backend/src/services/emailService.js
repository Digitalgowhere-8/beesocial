const RESEND_API_URL = 'https://api.resend.com/emails';

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!isConfigured()) {
    const err = new Error('Email delivery is not configured on the server');
    err.status = 503;
    throw err;
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {})
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.message || 'Failed to send email');
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inferBrandName() {
  const explicit = String(process.env.EMAIL_BRAND_NAME || '').trim();
  if (explicit) return explicit;

  const frontendUrl = String(process.env.FRONTEND_URL || '').trim();
  if (frontendUrl) {
    try {
      const hostname = new URL(frontendUrl).hostname.replace(/^www\./i, '');
      const firstLabel = hostname.split('.')[0] || 'BeeSocial';
      return firstLabel
        .split(/[-_]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || 'BeeSocial';
    } catch {
      // Fall back below.
    }
  }

  return 'BeeSocial';
}

function supportSignature() {
  const replyTo = String(process.env.EMAIL_REPLY_TO || '').trim();
  if (replyTo) return `If you need help, reply to ${replyTo}.`;
  return 'If you did not expect this message, you can ignore it.';
}

function buildPasswordResetEmail({ name, resetUrl, expiresMinutes }) {
  const brandName = inferBrandName();
  const safeName = escapeHtml(name || 'there');
  const safeUrl = escapeHtml(resetUrl);
  const safeMinutes = Number(expiresMinutes) || 15;
  const supportLine = supportSignature();
  const safeSupportLine = escapeHtml(supportLine);
  const subject = `${brandName} password reset request`;
  const text = [
    `Hi ${name || 'there'},`,
    '',
    `We received a request to reset the password for your ${brandName} account.`,
    `Use the secure link below within ${safeMinutes} minutes to choose a new password:`,
    resetUrl,
    '',
    'If you did not request a password reset, no action is required.',
    supportLine
  ].join('\n');

  const html = `
    <div style="margin:0;padding:24px;background:#faf0f2;font-family:Roboto,Arial,sans-serif;color:#111827;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid rgba(209,18,67,0.08);border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(209,18,67,0.08);">
        <div style="padding:28px 28px 20px;background:linear-gradient(135deg,#d11243 0%,#8f0b2f 100%);color:#ffffff;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;opacity:0.8;">Security</div>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.15;font-weight:900;">Password reset request</h1>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hi ${safeName},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">We received a request to reset the password for your ${escapeHtml(brandName)} account.</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Use the secure link below to choose a new password.</p>
          <div style="margin:24px 0;">
            <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:linear-gradient(135deg,#d11243 0%,#8f0b2f 100%);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Reset Password</a>
          </div>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#4b5563;">This link expires in ${safeMinutes} minutes.</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#4b5563;">If the button does not work, copy and paste this link into your browser:</p>
          <p style="margin:0 0 16px;word-break:break-all;font-size:13px;line-height:1.7;color:#d11243;">${safeUrl}</p>
          <p style="margin:0 0 10px;font-size:13px;line-height:1.7;color:#6b7280;">If you did not request a password reset, no action is required.</p>
          <p style="margin:0;font-size:13px;line-height:1.7;color:#6b7280;">${safeSupportLine}</p>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

function buildAdminBroadcastEmail({ heading, preview, message, ctaLabel, ctaUrl, footerNote, recipientName }) {
  const brandName = inferBrandName();
  const safeHeading = escapeHtml(heading || 'Platform update');
  const safePreview = escapeHtml(preview || `A message from the ${brandName} admin team.`);
  const safeFooterNote = escapeHtml(footerNote || `You received this email because your account is part of the ${brandName} workspace.`);
  const safeRecipientName = escapeHtml(recipientName || 'there');
  const safeCtaLabel = ctaLabel ? escapeHtml(ctaLabel) : '';
  const safeCtaUrl = ctaUrl ? escapeHtml(ctaUrl) : '';
  const lines = String(message || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd());

  const htmlBody = lines
    .map((line) => (line
      ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.75;color:#374151;">${escapeHtml(line)}</p>`
      : '<div style="height:10px;"></div>'))
    .join('');

  const text = [
    `Hi ${recipientName || 'there'},`,
    '',
    ...lines,
    '',
    ctaUrl ? `${ctaLabel || 'Open link'}: ${ctaUrl}` : '',
    '',
    footerNote || `You received this email because your account is part of the ${brandName} workspace.`,
    supportSignature()
  ].filter(Boolean).join('\n');

  const html = `
    <div style="margin:0;padding:24px;background:#faf0f2;font-family:Roboto,Arial,sans-serif;color:#111827;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid rgba(209,18,67,0.08);border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(209,18,67,0.08);">
        <div style="padding:28px 28px 22px;background:linear-gradient(135deg,#d11243 0%,#8f0b2f 100%);color:#ffffff;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;opacity:0.82;">${escapeHtml(brandName)} admin update</div>
          <h1 style="margin:12px 0 8px;font-size:28px;line-height:1.15;font-weight:900;">${safeHeading}</h1>
          <p style="margin:0;font-size:14px;line-height:1.7;color:rgba(255,255,255,0.86);">${safePreview}</p>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hi ${safeRecipientName},</p>
          ${htmlBody}
          ${safeCtaUrl ? `
            <div style="margin:24px 0;">
              <a href="${safeCtaUrl}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:linear-gradient(135deg,#d11243 0%,#8f0b2f 100%);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">${safeCtaLabel || 'Open link'}</a>
            </div>
          ` : ''}
          <div style="margin-top:24px;border-top:1px solid #f1f5f9;padding-top:16px;font-size:12px;line-height:1.7;color:#6b7280;">
            <div>${safeFooterNote}</div>
            <div style="margin-top:8px;">${escapeHtml(supportSignature())}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  return { html, text };
}

module.exports = {
  buildAdminBroadcastEmail,
  buildPasswordResetEmail,
  isConfigured,
  sendEmail
};
