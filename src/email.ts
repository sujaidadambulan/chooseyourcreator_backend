import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config.js";
import { BRAND } from "./shared/index.js";

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    });
  }
  return _transporter;
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"${config.emailFromName}" <${config.emailFrom}>`,
    to,
    subject,
    html,
  });
}

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f8f8f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #f3f4f6;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px;">${BRAND.name}</h1>
              <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">${BRAND.tagline}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                © ${new Date().getFullYear()} ${BRAND.name} · Questions? ${BRAND.adminEmail}
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

export function signupOtpEmail(otp: string, email: string): string {
  return baseTemplate(
    `Verify your email – ${BRAND.name}`,
    `<h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Verify your email address</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">We sent this verification code to <strong style="color:#111827;">${email}</strong>. Enter it to complete your signup.</p>
    <div style="background:#f9fafb;border:2px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Your verification code</p>
      <p style="margin:0;font-size:40px;font-weight:800;letter-spacing:12px;color:#111827;font-family:'Courier New',monospace;">${otp}</p>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">⏰ This code expires in <strong>5 minutes</strong>.</p>
    <p style="margin:0;font-size:13px;color:#ef4444;">🔒 Never share this code with anyone. ${BRAND.name} will never ask for it.</p>`,
  );
}

export function resetOtpEmail(otp: string, email: string): string {
  return baseTemplate(
    `Reset your ${BRAND.name} password`,
    `<h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Reset your password</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">We received a request to reset the password for <strong style="color:#111827;">${email}</strong>. Use this code to create a new password.</p>
    <div style="background:#f9fafb;border:2px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Password reset code</p>
      <p style="margin:0;font-size:40px;font-weight:800;letter-spacing:12px;color:#111827;font-family:'Courier New',monospace;">${otp}</p>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">⏰ This code expires in <strong>5 minutes</strong>.</p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">If you did not request a password reset, you can safely ignore this email.</p>
    <p style="margin:0;font-size:13px;color:#ef4444;">🔒 Never share this code with anyone.</p>`,
  );
}

export function paymentDepositVerifiedEmail(params: {
  campaignTitle: string;
  brandName: string;
  creatorName: string;
  amountLabel: string;
}): string {
  return baseTemplate(
    "Initial payment verified",
    `<h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Payment deposit verified</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">An administrator verified the brand&rsquo;s initial payment for campaign <strong>${params.campaignTitle}</strong>.</p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;color:#374151;line-height:1.6;">
      <li><strong>Brand:</strong> ${params.brandName}</li>
      <li><strong>Creator:</strong> ${params.creatorName}</li>
      <li><strong>Amount:</strong> ${params.amountLabel}</li>
      <li><strong>Status:</strong> HELD — collaboration is now active</li>
    </ul>
    <p style="margin:0;font-size:13px;color:#6b7280;">This message was sent by ${BRAND.name} for your records.</p>`,
  );
}

export function paymentDisbursalCompletedEmail(params: {
  campaignTitle: string;
  brandName: string;
  creatorName: string;
  amountLabel: string;
}): string {
  return baseTemplate(
    "Payment released to creator",
    `<h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Payment disbursed</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">An administrator marked the initial payment as <strong>RELEASED</strong> for campaign <strong>${params.campaignTitle}</strong>.</p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;color:#374151;line-height:1.6;">
      <li><strong>Brand:</strong> ${params.brandName}</li>
      <li><strong>Creator:</strong> ${params.creatorName}</li>
      <li><strong>Amount:</strong> ${params.amountLabel}</li>
      <li><strong>Status:</strong> RELEASED — collaboration completed</li>
    </ul>
    <p style="margin:0;font-size:13px;color:#6b7280;">This message was sent by ${BRAND.name} for your records.</p>`,
  );
}
