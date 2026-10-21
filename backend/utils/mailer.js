const nodemailer = require('nodemailer');

// Real SMTP credentials (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS in .env) are
// used if provided — that's what you'd set for an actual deployment. With no
// SMTP_HOST set, this falls back to a disposable Ethereal Email test account,
// created fresh the first time it's needed. Ethereal doesn't deliver to a
// real inbox — it's a fake SMTP sandbox made for exactly this (local dev
// without a real mail account) — but every message it accepts gets a preview
// URL you can open in a browser to see exactly what would have been sent.
let transporterPromise = null;

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (process.env.SMTP_HOST) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
    }
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  })();

  return transporterPromise;
}

async function sendPasswordResetEmail(to, code) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: '"CampusEase" <no-reply@campusease.edu>',
    to,
    subject: 'Your CampusEase password reset code',
    text: `Your password reset code is ${code}. It expires in 15 minutes. If you didn't request this, you can ignore this email.`,
    html: `<p>Your password reset code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`,
  });
  // Only set when the transport is Ethereal — null for a real SMTP provider.
  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  return { previewUrl };
}

module.exports = { sendPasswordResetEmail };
