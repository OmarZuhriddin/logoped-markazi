import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CLICK_ERR, clickConfig, clickSign, signMatches } from "@/lib/click";

/**
 * Click'ning Prepare va Complete so'rovlari (SHOP-API). Click kabinetida
 * ikkala manzilga ham shu URL yoziladi: `<sayt>/api/click`.
 *
 * Har javob HTTP 200 bilan ketadi, xato esa `error` maydonida (Click shuni
 * kutadi). Pul yozilishi faqat to'g'ri imzo va aynan kutilgan summa bilan.
 */

const ok = (extra: Record<string, unknown>) =>
  NextResponse.json({ error: CLICK_ERR.OK, error_note: "Success", ...extra });
const fail = (error: number, note: string, base: Record<string, unknown>) =>
  NextResponse.json({ ...base, error, error_note: note });

async function readBody(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v ?? "")]));
  }
  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text));
}

export async function POST(req: Request) {
  const cfg = clickConfig();
  const b = await readBody(req);
  const base = {
    click_trans_id: b.click_trans_id,
    merchant_trans_id: b.merchant_trans_id,
  };
  if (!cfg) return fail(CLICK_ERR.REQUEST, "Click sozlanmagan", base);

  const required = ["click_trans_id", "service_id", "merchant_trans_id", "amount", "action", "sign_time", "sign_string"];
  if (required.some((k) => !b[k]) || (b.action === "1" && !b.merchant_prepare_id)) {
    return fail(CLICK_ERR.REQUEST, "Error in request from click", base);
  }

  // Imzo hamma narsadan oldin: begona so'rov bazaga umuman tegmasin
  const expected = clickSign(cfg, {
    click_trans_id: b.click_trans_id,
    service_id: b.service_id,
    merchant_trans_id: b.merchant_trans_id,
    merchant_prepare_id: b.merchant_prepare_id,
    amount: b.amount,
    action: b.action,
    sign_time: b.sign_time,
  });
  if (b.service_id !== cfg.serviceId || !signMatches(expected, b.sign_string)) {
    return fail(CLICK_ERR.SIGN, "SIGN CHECK FAILED!", base);
  }
  if (b.action !== "0" && b.action !== "1") return fail(CLICK_ERR.ACTION, "Action not found", base);

  const id = Number(b.merchant_trans_id);
  const tx = Number.isInteger(id) ? await prisma.clickTransaction.findUnique({ where: { id } }) : null;
  if (!tx) return fail(CLICK_ERR.NOT_FOUND, "Transaction does not exist", base);

  if (Math.abs(Number(b.amount) - tx.amount) > 0.009) {
    return fail(CLICK_ERR.AMOUNT, "Incorrect parameter amount", base);
  }
  if (tx.status === "PAID") return fail(CLICK_ERR.ALREADY_PAID, "Already paid", base);
  if (tx.status === "CANCELLED") return fail(CLICK_ERR.CANCELLED, "Transaction cancelled", base);

  if (b.action === "0") {
    await prisma.clickTransaction.update({
      where: { id },
      data: { status: "PREPARED", clickTransId: b.click_trans_id },
    });
    return ok({ ...base, merchant_prepare_id: id });
  }

  // Complete
  if (String(id) !== b.merchant_prepare_id) {
    return fail(CLICK_ERR.TRANSACTION_NOT_FOUND, "Transaction not found", base);
  }
  // Click to'lovni bekor qilgan (error < 0): pul yozilmaydi
  if (Number(b.error ?? "0") < 0) {
    await prisma.clickTransaction.update({ where: { id }, data: { status: "CANCELLED" } });
    return fail(CLICK_ERR.CANCELLED, "Transaction cancelled", { ...base, merchant_prepare_id: id });
  }

  // Ikki marta Complete kelsa ham to'lov bitta yoziladi: holat shartli o'zgartiriladi
  const paymentId = await prisma.$transaction(async (db) => {
    const moved = await db.clickTransaction.updateMany({
      where: { id, status: { in: ["PENDING", "PREPARED"] } },
      data: { status: "PAID", clickTransId: b.click_trans_id },
    });
    if (moved.count === 0) return null;
    const payment = await db.payment.create({
      data: {
        clientId: tx.clientId,
        branchId: tx.branchId,
        amount: tx.amount,
        method: "CLICK",
        note: `Click #${b.click_trans_id}`,
      },
      select: { id: true },
    });
    await db.clickTransaction.update({ where: { id }, data: { paymentId: payment.id } });
    return payment.id;
  });
  if (!paymentId) return fail(CLICK_ERR.ALREADY_PAID, "Already paid", base);

  after(async () => {
    try {
      const { syncAfterChange } = await import("@/lib/sheets");
      await syncAfterChange();
    } catch (e) {
      console.error("Google jadvalga yozilmadi:", e);
    }
  });
  revalidatePath("/m");
  revalidatePath("/payments");
  revalidatePath(`/clients/${tx.clientId}`);
  revalidatePath("/");
  return ok({ ...base, merchant_prepare_id: id, merchant_confirm_id: id });
}
