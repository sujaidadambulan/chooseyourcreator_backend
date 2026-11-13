import { normalizeIndianPhone } from "./shared/index.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { HttpError } from "./http.js";
import { otpCode, sha256 } from "./auth.js";

export async function sendPhoneOtp(rawPhone: string): Promise<{ devCode?: string }> {
  const phone = normalizeIndianPhone(rawPhone);
  if (!phone) throw new HttpError(400, "Enter a valid Indian mobile number");

  const code = otpCode();
  await prisma.phoneOtp.deleteMany({ where: { phone } });
  await prisma.phoneOtp.create({
    data: {
      phone,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  if (config.msg91AuthKey) {
    const response = await fetch("https://control.msg91.com/api/v5/otp", {
      method: "POST",
      headers: {
        authkey: config.msg91AuthKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_id: config.msg91TemplateId,
        mobile: phone.replace("+", ""),
        otp: code,
      }),
    });
    if (!response.ok && config.isProduction) {
      throw new HttpError(502, "Could not send the verification code");
    }
    if (response.ok) return {};
  }

  if (config.isProduction) {
    throw new HttpError(503, "Phone verification is not configured");
  }
  return { devCode: code };
}
