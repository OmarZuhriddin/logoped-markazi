"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { ActionError, withFlash } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setFlash } from "@/lib/flash";
import { PARENT_CANCEL_MIN_HOURS, CLICK_MIN, CLICK_MAX } from "@/lib/constants";
import { clickEnabled, clickPayUrl } from "@/lib/click";
import { getT } from "@/lib/i18n/server";
import { queueParentCancel, sendPending } from "@/lib/notify";

/**
 * Ota-ona farzandining mashg'ulotini o'zi bekor qiladi.
 *
 * Holat "Mijoz bekor qildi" bo'ladi — xodim tugmasi bilan bir xil, shuning
 * uchun abonementdan yechilmaydi va mutaxassisga haq yozilmaydi. Seans
 * o'chirilmaydi: jadvalda kim, qachon bekor qilgani ko'rinib tursin.
 */
async function cancelByParentImpl(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "PARENT") throw new Error("Sizda bu amal uchun ruxsat yo'q.");

  const sessionId = String(formData.get("sessionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      startsAt: true,
      note: true,
      client: { select: { parentUserId: true } },
      branch: { select: { isSolo: true } },
    },
  });
  // Begona bolaning seansi "topilmadi" deb javob oladi — borligini ham bilmasin
  if (!session || session.client.parentUserId !== user.id) {
    throw new Error("Seans topilmadi.");
  }
  if (session.status !== "PLANNED") {
    throw new Error("Bu mashg'ulot allaqachon belgilangan.");
  }
  const hoursLeft = (session.startsAt.getTime() - Date.now()) / 3_600_000;
  if (hoursLeft < PARENT_CANCEL_MIN_HOURS) {
    // Yakka logopedning mijozi markazga emas, logopedning o'ziga qo'ng'iroq qiladi
    throw new ActionError(
      session.branch.isSolo
        ? "Mashg'ulotga {n} soatdan kam qoldi — bekor qilish uchun logopedga qo'ng'iroq qiling."
        : "Mashg'ulotga {n} soatdan kam qoldi — bekor qilish uchun markazga qo'ng'iroq qiling.",
      { n: PARENT_CANCEL_MIN_HOURS },
    );
  }

  // Sabab xodimlar ichki izohiga qo'shiladi: jadvalda shu yerda ko'rinadi
  const mark = reason ? `Ota-ona bekor qildi: ${reason}` : "Ota-ona bekor qildi";
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: "CANCELLED_CLIENT",
      price: 0,
      salaryPercent: null,
      note: session.note ? `${session.note} · ${mark}` : mark,
    },
  });

  after(async () => {
    try {
      const queued = await queueParentCancel(sessionId, reason);
      if (queued > 0) await sendPending(10);
    } catch (e) {
      console.error("Xodimlarga bekor qilish xabari yuborilmadi:", e);
    }
  });

  await setFlash(
    session.branch.isSolo
      ? "Mashg'ulot bekor qilindi, logopedga xabar berildi."
      : "Mashg'ulot bekor qilindi, markazga xabar berildi.",
    "ok",
  );
  revalidatePath("/m");
  revalidatePath("/schedule");
}

export const cancelByParent = withFlash(cancelByParentImpl);

/**
 * Ota-ona Click orqali to'lovni boshlaydi: to'lov urinishi yoziladi va Click
 * sahifasining manzili qaytadi. Pul tizimga faqat Click Complete'ni
 * tasdiqlaganda tushadi (`/api/click`), bu yerda hech narsa to'langan hisoblanmaydi.
 *
 * Yakka logopedning mijozi bu yerdan to'lay olmaydi: Click hisobi markazniki,
 * pul logopedga emas, markazga tushib qolardi.
 */
export async function startClickPayment(
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  const user = await requireUser();
  const t = await getT();
  if (user.role !== "PARENT") return { error: t("Sizda bu amal uchun ruxsat yo'q.") };
  if (!clickEnabled()) return { error: t("Click orqali to'lov hozircha yoqilmagan.") };

  const clientId = String(formData.get("clientId") ?? "");
  const amount = Math.round(Number(String(formData.get("amount") ?? "").replace(/[^\d]/g, "")));
  if (!Number.isFinite(amount) || amount < CLICK_MIN || amount > CLICK_MAX) {
    return {
      error: t("Summa {min} dan {max} gacha bo'lsin.", {
        min: t.money(CLICK_MIN),
        max: t.money(CLICK_MAX),
      }),
    };
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, parentUserId: true, branchId: true, branch: { select: { isSolo: true } } },
  });
  // Begona bolaga to'lov boshlab bo'lmaydi
  if (!client || client.parentUserId !== user.id) return { error: t("Mijoz topilmadi.") };
  if (client.branch.isSolo) return { error: t("Click orqali to'lov hozircha yoqilmagan.") };

  const tx = await prisma.clickTransaction.create({
    data: { clientId: client.id, branchId: client.branchId, amount },
    select: { id: true },
  });
  const url = clickPayUrl(tx.id, amount);
  if (!url) return { error: t("Click orqali to'lov hozircha yoqilmagan.") };
  return { url };
}
