const RESEND_API_URL = 'https://api.resend.com/emails';

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

function senderIdentity() {
  const rawFrom = String(process.env.EMAIL_FROM || '').trim();
  const displayName = String(process.env.EMAIL_FROM_NAME || '').trim();
  if (!rawFrom) return '';
  if (!displayName || /<.+@.+>/.test(rawFrom)) return rawFrom;
  return `"${displayName.replace(/"/g, '\\"')}" <${rawFrom}>`;
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
      from: senderIdentity(),
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

function inferBrandLogoUrl() {
  const explicit = String(process.env.EMAIL_BRAND_LOGO_URL || '').trim();
  if (explicit) return explicit;

  const frontendUrl = String(process.env.FRONTEND_URL || '').trim();
  if (!frontendUrl) return '';

  try {
    return new URL('/logo.png?v=20260718', frontendUrl).toString();
  } catch {
    return '';
  }
}

function isPublicHttpUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = String(parsed.hostname || '').toLowerCase();
    return !['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
  } catch {
    return false;
  }
}

function supportSignature() {
  const replyTo = String(process.env.EMAIL_REPLY_TO || '').trim();
  if (replyTo) return `If you need help, reply to ${replyTo}.`;
  return 'If you did not expect this message, you can ignore it.';
}

function applyInlineEmailFormatting(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;color:#1f2937;">$1</strong>');
}

function renderAdminEmailBody(lines) {
  const chunks = [];
  let bulletItems = [];

  const flushBullets = () => {
    if (!bulletItems.length) return;
    chunks.push(`
      <ul style="margin:0 0 18px;padding:0 0 0 18px;color:#3f4a5a;">
        ${bulletItems.map((item) => `<li style="margin:0 0 10px;line-height:1.65;font-size:15px;">${applyInlineEmailFormatting(item)}</li>`).join('')}
      </ul>
    `);
    bulletItems = [];
  };

  lines.forEach((line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed) {
      flushBullets();
      chunks.push('<div style="height:8px;"></div>');
      return;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      bulletItems.push(bulletMatch[1]);
      return;
    }

    flushBullets();

    if (/:\s*$/.test(trimmed) && trimmed.length <= 80) {
      chunks.push(`<p style="margin:0 0 12px;font-size:16px;line-height:1.55;font-weight:700;color:#253041;">${applyInlineEmailFormatting(trimmed)}</p>`);
      return;
    }

    chunks.push(`<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3f4a5a;">${applyInlineEmailFormatting(trimmed)}</p>`);
  });

  flushBullets();
  return chunks.join('');
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
    <div style="margin:0;padding:24px;background:#FAFBF7;font-family:Roboto,Arial,sans-serif;color:#111827;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #D8DED2;border-radius:20px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
        <div style="padding:28px 28px 20px;background:#163A24;color:#ffffff;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#F9C416;">Security</div>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.15;font-weight:900;">Password reset request</h1>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hi ${safeName},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">We received a request to reset the password for your ${escapeHtml(brandName)} account.</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Use the secure link below to choose a new password.</p>
          <div style="margin:24px 0;">
            <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#163A24;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Reset Password</a>
          </div>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#4b5563;">This link expires in ${safeMinutes} minutes.</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#4b5563;">If the button does not work, copy and paste this link into your browser:</p>
          <p style="margin:0 0 16px;word-break:break-all;font-size:13px;line-height:1.7;color:#163A24;">${safeUrl}</p>
          <p style="margin:0 0 10px;font-size:13px;line-height:1.7;color:#6b7280;">If you did not request a password reset, no action is required.</p>
          <p style="margin:0;font-size:13px;line-height:1.7;color:#6b7280;">${safeSupportLine}</p>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

function buildWelcomeEmail({ name, loginUrl, accountStatus = 'active', role = 'user', company = '', createdByName = '' } = {}) {
  const brandName = inferBrandName();
  const brandLogoUrl = inferBrandLogoUrl();
  const safeName = escapeHtml(name || 'there');
  const safeBrandName = escapeHtml(brandName);
  const safeBrandLogoUrl = isPublicHttpUrl(brandLogoUrl) ? escapeHtml(brandLogoUrl) : '';
  const safeLoginUrl = loginUrl ? escapeHtml(loginUrl) : '';
  const safeCompany = escapeHtml(company || '');
  const safeCreator = escapeHtml(createdByName || 'your admin');
  const isPending = accountStatus === 'pending';
  const roleLabel = role === 'admin' ? 'admin' : role === 'super_admin' ? 'super admin' : 'member';
  const subject = isPending ? `Welcome to ${brandName} - approval pending` : `Welcome to ${brandName}`;
  const preview = isPending
    ? 'Your account has been received and is waiting for approval.'
    : 'Your account is ready. You can sign in and start using your workspace.';
  const bodyLines = isPending
    ? [
        `Your ${brandName} account has been created and is currently waiting for super admin approval.`,
        'Once approved, you will be able to sign in and start using your workspace.'
      ]
    : [
        `Your ${brandName} ${roleLabel} account is ready${company ? ` for ${company}` : ''}.`,
        `It was created by ${createdByName || 'your admin'}. You can now sign in and begin using your workspace.`,
        'For security, use the password shared with you by your admin or reset your password from the login page.'
      ];
  const supportLine = supportSignature();

  const text = [
    `Hi ${name || 'there'},`,
    '',
    ...bodyLines,
    '',
    loginUrl ? `Sign in: ${loginUrl}` : '',
    '',
    supportLine
  ].filter(Boolean).join('\n');

  const html = `
    <style>
      @media only screen and (max-width: 600px) {
        .welcome-shell { padding: 20px 10px !important; }
        .welcome-card { border-radius: 18px !important; }
        .welcome-header { padding: 24px 18px 20px !important; }
        .welcome-body { padding: 24px 18px 24px !important; }
        .welcome-title { font-size: 30px !important; line-height: 1.16 !important; }
        .welcome-cta { display:block !important;width:100% !important;box-sizing:border-box !important;text-align:center !important; }
      }
    </style>
    <div class="welcome-shell" style="margin:0;padding:36px 16px;background:#f7f8fb;font-family:Roboto,Arial,sans-serif;color:#1f2937;">
      <div class="welcome-card" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #ead8de;border-radius:24px;overflow:hidden;box-shadow:0 20px 56px rgba(148,163,184,0.18);">
        <div style="height:6px;background:linear-gradient(90deg,#f4c8d7 0%,#d11243 100%);"></div>
        <div class="welcome-header" style="padding:30px 30px 24px;background:linear-gradient(180deg,#fffdfd 0%,#fbf4f6 100%);border-bottom:1px solid #efe4e8;">
          ${safeBrandLogoUrl ? `<img src="${safeBrandLogoUrl}" alt="${safeBrandName} logo" style="display:block;height:34px;width:auto;max-width:190px;" />` : `<div style="font-size:20px;font-weight:800;color:#1f2937;">${safeBrandName}</div>`}
          <div style="margin-top:14px;display:inline-flex;align-items:center;padding:5px 10px;border-radius:999px;background:#ffffff;color:#b42358;border:1px solid #f0d3dd;font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Welcome</div>
          <h1 class="welcome-title" style="margin:18px 0 0;font-size:36px;line-height:1.12;font-weight:800;letter-spacing:-0.02em;color:#1f2937;">${escapeHtml(preview)}</h1>
        </div>
        <div class="welcome-body" style="padding:32px 30px 30px;">
          <p style="margin:0 0 18px;font-size:16px;line-height:1.75;color:#3f4a5a;">Hi ${safeName},</p>
          ${bodyLines.map((line) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#3f4a5a;">${escapeHtml(line)}</p>`).join('')}
          ${safeCompany && !isPending ? `<div style="margin:20px 0;padding:14px 16px;border-radius:14px;background:#faf5f7;border:1px solid #efdde4;color:#475467;font-size:14px;line-height:1.6;"><strong style="color:#1f2937;">Workspace:</strong> ${safeCompany}<br /><strong style="color:#1f2937;">Created by:</strong> ${safeCreator}</div>` : ''}
          ${safeLoginUrl ? `
            <div style="margin:26px 0 8px;">
              <a class="welcome-cta" href="${safeLoginUrl}" style="display:inline-block;padding:13px 22px;border-radius:14px;background:linear-gradient(135deg,#d11243 0%,#b0123e 100%);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;box-shadow:0 12px 24px rgba(209,18,67,0.18);">${isPending ? 'Open login page' : 'Sign in'}</a>
            </div>
          ` : ''}
          <div style="margin-top:30px;border-top:1px solid #ece7ea;padding-top:18px;font-size:12px;line-height:1.8;color:#8a94a6;">
            ${escapeHtml(supportLine)}
          </div>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

function buildAdminBroadcastEmail({ heading, preview, message, ctaLabel, ctaUrl, footerNote, recipientName }) {
  const brandName = inferBrandName();
  const brandLogoUrl = inferBrandLogoUrl();
  const safeHeading = escapeHtml(heading || 'Platform update');
  const safePreview = escapeHtml(preview || `A message from the ${brandName} admin team.`);
  const safeFooterNote = escapeHtml(footerNote || `You received this email because your account is part of the ${brandName} workspace.`);
  const safeRecipientName = escapeHtml(recipientName || 'there');
  const safeCtaLabel = ctaLabel ? escapeHtml(ctaLabel) : '';
  const safeCtaUrl = ctaUrl ? escapeHtml(ctaUrl) : '';
  const safeBrandName = escapeHtml(brandName);
  const safeBrandLogoUrl = isPublicHttpUrl(brandLogoUrl) ? escapeHtml(brandLogoUrl) : '';
  const lines = String(message || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd());

  const htmlBody = renderAdminEmailBody(lines);

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
    <style>
      @media only screen and (max-width: 600px) {
        .email-shell {
          padding: 20px 10px !important;
        }
        .email-card {
          border-radius: 18px !important;
        }
        .email-header {
          padding: 22px 18px 18px !important;
        }
        .email-body {
          padding: 24px 18px 24px !important;
        }
        .email-title {
          margin-top: 18px !important;
          font-size: 28px !important;
          line-height: 1.2 !important;
        }
        .email-copy {
          font-size: 15px !important;
          line-height: 1.75 !important;
        }
        .email-preview {
          font-size: 13px !important;
          line-height: 1.65 !important;
        }
        .email-logo {
          max-width: 150px !important;
          height: 28px !important;
        }
        .email-cta-wrap {
          margin: 24px 0 4px !important;
        }
        .email-cta {
          display: block !important;
          width: 100% !important;
          box-sizing: border-box !important;
          text-align: center !important;
          padding: 14px 18px !important;
        }
      }
    </style>
    <div class="email-shell" style="margin:0;padding:36px 16px;background:#f5f6f8;font-family:Roboto,Arial,sans-serif;color:#1f2937;">
      <div class="email-card" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e9d8df;border-radius:24px;overflow:hidden;box-shadow:0 22px 60px rgba(148,163,184,0.16);">
        <div style="height:6px;background:linear-gradient(90deg,#f4c8d7 0%,#d11243 100%);"></div>
        <div class="email-header" style="padding:28px 30px 22px;background:linear-gradient(180deg,#fffdfd 0%,#f9f4f6 100%);border-bottom:1px solid #efe4e8;">
          <div style="min-width:0;">
            ${safeBrandLogoUrl ? `<img class="email-logo" src="${safeBrandLogoUrl}" alt="${safeBrandName} logo" style="display:block;height:34px;width:auto;max-width:190px;" />` : `<div style="font-size:20px;font-weight:700;letter-spacing:0.01em;color:#1f2937;">${safeBrandName}</div>`}
            <div style="margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <div style="display:inline-flex;align-items:center;padding:5px 10px;border-radius:999px;background:#ffffff;color:#b42358;border:1px solid #f0d3dd;font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Admin update</div>
            </div>
            <div class="email-preview" style="margin-top:10px;font-size:14px;line-height:1.7;color:#667085;">${safePreview}</div>
          </div>
          <h1 class="email-title" style="margin:22px 0 0;font-size:34px;line-height:1.15;font-weight:700;letter-spacing:-0.02em;color:#1f2937;">${safeHeading}</h1>
        </div>
        <div class="email-body" style="padding:32px 30px 30px;">
          <p class="email-copy" style="margin:0 0 20px;font-size:16px;line-height:1.75;color:#3f4a5a;">Hi ${safeRecipientName},</p>
          ${htmlBody}
          ${safeCtaUrl ? `
            <div class="email-cta-wrap" style="margin:28px 0 8px;">
              <a class="email-cta" href="${safeCtaUrl}" style="display:inline-block;padding:13px 22px;border-radius:14px;background:linear-gradient(135deg,#d11243 0%,#b0123e 100%);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.01em;box-shadow:0 12px 24px rgba(209,18,67,0.18);">${safeCtaLabel || 'Open link'}</a>
            </div>
          ` : ''}
          <div style="margin-top:30px;border-top:1px solid #ece7ea;padding-top:18px;font-size:12px;line-height:1.8;color:#8a94a6;">
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
  buildWelcomeEmail,
  isConfigured,
  sendEmail
};
