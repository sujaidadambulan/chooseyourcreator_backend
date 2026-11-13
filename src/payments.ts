import { createHmac } from "node:crypto";
import { config } from "./config.js";

export type CreatedOrder = { id: string; amount: number; currency: string };

export async function createRazorpayOrder(amountPaise: number, receipt: string): Promise<CreatedOrder> {
  if (!config.paymentsLive) {
    return { id: `dev_${receipt}`, amount: amountPaise, currency: "INR" };
  }
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    throw new Error("Razorpay keys are not configured");
  }
  const Razorpay = (await import("razorpay")).default;
  const client = new Razorpay({
    key_id: config.razorpayKeyId,
    key_secret: config.razorpayKeySecret,
  });
  const order = await client.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt,
  });
  return { id: order.id, amount: Number(order.amount), currency: order.currency };
}

export function verifyRazorpayWebhook(rawBody: Buffer, signature: string | undefined): boolean {
  if (!config.paymentsLive) return false;
  if (!signature || !config.razorpayWebhookSecret) return false;
  const expected = createHmac("sha256", config.razorpayWebhookSecret).update(rawBody).digest("hex");
  return expected === signature;
}
