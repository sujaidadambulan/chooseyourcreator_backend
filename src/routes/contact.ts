import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../http.js";
import { sendEmail } from "../email.js";
import { config } from "../config.js";
import { BRAND } from "../shared/index.js";

export const contactRouter = Router();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

contactRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1, "Name is required").max(100),
        email: z.string().email("Enter a valid email"),
        subject: z.string().max(200).optional(),
        message: z.string().min(10, "Message must be at least 10 characters").max(5000),
      })
      .parse(req.body);

    const subject = escapeHtml(body.subject?.trim() || "New contact form submission");
    const safeName = escapeHtml(body.name);
    const safeEmail = escapeHtml(body.email);
    const safeMessage = escapeHtml(body.message);
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:#111827;">New Contact Form Submission</h2>
        <p><strong>From:</strong> ${safeName} &lt;${safeEmail}&gt;</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
        <p style="white-space:pre-wrap;">${safeMessage}</p>
      </div>
    `;

    try {
      await sendEmail({
        to: config.emailFrom,
        subject: `[${BRAND.name} Contact] ${subject}`,
        html,
      });
    } catch (err) {
      console.error("Contact form email error:", err);
      // In dev, don't fail the request
      if (config.isProduction) {
        res.status(500).json({ error: `Could not send message. Please email us directly at ${BRAND.adminEmail}` });
        return;
      }
    }

    res.json({ ok: true });
  }),
);
