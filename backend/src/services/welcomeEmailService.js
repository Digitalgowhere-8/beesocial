const User = require('../models/User');
const { buildWelcomeEmail, isConfigured, sendEmail } = require('./emailService');

function loginUrl() {
  const frontendBaseUrl = String(process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  if (!frontendBaseUrl) return '';
  return `${frontendBaseUrl}/login`;
}

async function sendWelcomeEmailOnce(user, { createdByName = '' } = {}) {
  if (!user?._id || !user.email) {
    return { sent: false, reason: 'missing_user' };
  }
  if (user.welcomeEmailSentAt) {
    return { sent: false, reason: 'already_sent' };
  }
  if (!isConfigured()) {
    return { sent: false, reason: 'email_not_configured' };
  }

  const payload = buildWelcomeEmail({
    name: user.name,
    loginUrl: loginUrl(),
    accountStatus: user.isActive ? 'active' : 'pending',
    role: user.role,
    company: user.company,
    createdByName
  });

  await sendEmail({
    to: user.email,
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
    ...payload
  });

  const sentAt = new Date();
  await User.updateOne(
    {
      _id: user._id,
      $or: [
        { welcomeEmailSentAt: null },
        { welcomeEmailSentAt: { $exists: false } }
      ]
    },
    { $set: { welcomeEmailSentAt: sentAt } }
  );

  user.welcomeEmailSentAt = sentAt;
  return { sent: true, sentAt };
}

module.exports = {
  sendWelcomeEmailOnce
};
