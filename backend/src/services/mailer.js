const nodemailer = require("nodemailer");

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP config missing in .env (SMTP_HOST/SMTP_USER/SMTP_PASS)");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendInviteEmail({ to, inviteUrl, role }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const transporter = getTransporter();
  await transporter.sendMail({
    from,
    to,
    subject: "Account Invitation - NEB Result System",
    html: `
      <p>Hello,</p>
      <p>You have been invited to join the <b>NEB Result System</b> as <b>${role}</b>.</p>
      <p>Click the link below to set your password and activate your account:</p>
      <p><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p>This link will expire soon. If you did not request this, ignore this email.</p>
    `,
  });
}

module.exports = { sendInviteEmail };
