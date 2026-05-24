const nodemailer = require("nodemailer");
const env = require("../config/env");

let cachedTransporter = null;

function assertSmtpConfigured() {
  const host = (env.mail.host || "").trim();
  const user = (env.mail.user || "").trim();
  const pass = (env.mail.pass || "").trim();
  if (!host || !user || !pass) {
    throw new Error(
      "SMTP non configuré. Renseigne SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS et SMTP_FROM dans backend/.env (ex. Resend : smtp.resend.com / 465 / resend / re_xxx…)."
    );
  }
  if (/^re_REPLACE_WITH/i.test(pass)) {
    throw new Error(
      "SMTP_PASS contient encore le placeholder. Colle ta vraie clé API Resend (re_xxx…) dans backend/.env."
    );
  }
}

async function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  assertSmtpConfigured();

  cachedTransporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.port === 465,
    auth: {
      user: env.mail.user,
      pass: env.mail.pass,
    },
  });
  return cachedTransporter;
}

async function sendEmail({ to, subject, html, text, attachments = [] }) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: env.mail.from,
    to,
    subject,
    text,
    html,
    attachments,
  });
  return info;
}

module.exports = { sendEmail };
