import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { appUrl } from "@/lib/telegram";

/**
 * Click (click.uz) orqali onlayn to'lov: SHOP-API.
 *
 * Oqim: ota-ona kabinetda summani yozadi -> `ClickTransaction` yaratiladi ->
 * ota-ona Click to'lov sahifasiga o'tadi -> Click bizning `/api/click` manzilimizga
 * ikki marta murojaat qiladi: Prepare (action=0, "to'lov qabul qilinadimi?") va
 * Complete (action=1, "pul yechildi"). Complete'da `Payment` yoziladi.
 *
 * Sozlamalar muhit o'zgaruvchilarida (kalit kodga yozilmaydi). Uchalasi ham
 * bo'lmasa Click o'chiq: kabinetda tugma ko'rinmaydi, manzil esa rad etadi.
 */
export function clickConfig() {
  const serviceId = process.env.CLICK_SERVICE_ID?.trim();
  const merchantId = process.env.CLICK_MERCHANT_ID?.trim();
  const secretKey = process.env.CLICK_SECRET_KEY?.trim();
  if (!serviceId || !merchantId || !secretKey) return null;
  return { serviceId, merchantId, secretKey };
}

export const clickEnabled = () => clickConfig() !== null;

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

/** Click imzosi: tartib hujjatdagidek, Complete'da merchant_prepare_id qo'shiladi */
export function clickSign(
  cfg: { secretKey: string },
  p: {
    click_trans_id: string;
    service_id: string;
    merchant_trans_id: string;
    merchant_prepare_id?: string;
    amount: string;
    action: string;
    sign_time: string;
  },
): string {
  return md5(
    p.click_trans_id +
      p.service_id +
      cfg.secretKey +
      p.merchant_trans_id +
      (p.action === "1" ? (p.merchant_prepare_id ?? "") : "") +
      p.amount +
      p.action +
      p.sign_time,
  );
}

export function signMatches(expected: string, given: string): boolean {
  const a = Buffer.from(expected.toLowerCase());
  const b = Buffer.from(given.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Click to'lov sahifasi: ota-ona shu manzilga o'tadi */
export function clickPayUrl(transactionId: number, amount: number): string | null {
  const cfg = clickConfig();
  if (!cfg) return null;
  const q = new URLSearchParams({
    service_id: cfg.serviceId,
    merchant_id: cfg.merchantId,
    amount: String(amount),
    transaction_param: String(transactionId),
    return_url: `${appUrl()}/m?tab=payments`,
  });
  return `https://my.click.uz/services/pay?${q.toString()}`;
}

/** Click xato kodlari (hujjatdagi ma'nolari bilan) */
export const CLICK_ERR = {
  OK: 0,
  SIGN: -1,
  AMOUNT: -2,
  ACTION: -3,
  ALREADY_PAID: -4,
  NOT_FOUND: -5,
  TRANSACTION_NOT_FOUND: -6,
  UPDATE: -7,
  REQUEST: -8,
  CANCELLED: -9,
} as const;
