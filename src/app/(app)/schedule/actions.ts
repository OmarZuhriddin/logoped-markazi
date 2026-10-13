"use server";

import { parseDateInput } from "@/lib/format";
import { revalidatePath } from "next/cache";
import { ActionError, withFlash } from "@/lib/action";
import { setFlash } from "@/lib/flash";
import { dateTimeUz } from "@/lib/format";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { SESSION_STATUS_KEYS, type SessionStatus } from "@/lib/constants";
import { queueSessionDone, sendPending } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { assertTypeFitsBranch } from "@/lib/session-types";
import { sessionBalance } from "@/lib/session-balance";
import { getT } from "@/lib/i18n/server";

/** Seansni o'zgartirishga ruxsat bormi? */
async function assertCanEdit(sessionId: string) {
  const user = await requireUser();
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, branchId: true, specialistId: true },
  });
  if (!session) throw new Error("Seans topilmadi.");

  switch (user.role) {
    case "OWNER":
      break;
    case "BRANCH_ADMIN":
    case "RECEPTION":
      if (session.branchId !== user.branchId) throw new Error("Bu filial sizga tegishli emas.");
      break;
    case "SPECIALIST":
      if (session.specialistId !== user.specialistId) throw new Error("Bu seans sizga tegishli emas.");
      break;
    default:
      throw new Error("Sizda bu amal uchun ruxsat yo'q.");
  }
  return { user, session };
}

/** Davomat belgilash: O'tdi / Kelmadi / Bekor qilindi */
async function setSessionStatusImpl(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  const status = String(formData.get("status") ?? "") as SessionStatus;
  if (!SESSION_STATUS_KEYS.includes(status)) throw new Error("Holat noto'g'ri.");

  await assertCanEdit(sessionId);

  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      package: { select: { pricePerSession: true } },
      sessionType: { select: { price: true, salaryPercent: true } },
      specialist: { select: { salaryPercent: true, defaultPrice: true } },
    },
  });

  // "O'tdi" yoki "Kelmadi" — seans abonementdan yechiladi va narxi yoziladi.
  // Ish haqi foizi ham o'sha paytdagi holicha saqlanadi: keyin foiz o'zgarsa,
  // o'tib bo'lgan seanslarning hisobi o'zgarmaydi.
  //
  // Mijozlarning ko'pi abonement olmay, har kelganida to'laydi. Unday mijozda
  // narx seans xizmatidan olinadi. Aks holda narx 0 bo'lib qolardi va
  // mutaxassis o'sha seansdan hech narsa olmasdi.
  const billable = status === "DONE" || status === "NO_SHOW";
  // Narx: seansda yozilgani -> abonement narxi -> seans turining narxi ->
  // mutaxassisning o'z narxi -> markazning standart narxi. Abonement turdan
  // oldin: ota-ona abonementni o'sha narxda to'lagan. Yakka mutaxassisning
  // narxi markaznikiga bog'liq emas, shuning uchun u markaz narxidan oldin.
  const price = billable
    ? session.price ||
      session.package?.pricePerSession ||
      session.sessionType?.price ||
      session.specialist.defaultPrice ||
      (await getSettings()).defaultPrice
    : 0;

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      status,
      price,
      // Ulush xizmatdan: bitta xodim ham logoped, ham massaj qilsa, har biri
      // o'z foizida. Xizmatsiz eski seanslar xodimning foizida qoladi.
      salaryPercent: billable
        ? (session.salaryPercent ?? session.sessionType?.salaryPercent ?? session.specialist.salaryPercent)
        : null,
    },
  });

  // Mashg'ulot o'tgani haqida ota-onaga xabar — javobni kutib turmaydi.
  if (status === "DONE") {
    after(async () => {
      try {
        const queued = await queueSessionDone(sessionId);
        if (queued > 0) await sendPending(5);
      } catch (e) {
        console.error("Ota-onaga xabar yuborilmadi:", e);
      }
    });
  }

  revalidatePath("/schedule");
  revalidatePath("/");
  revalidatePath(`/clients/${session.clientId}`);
  revalidatePath("/reports");
  revalidatePath("/earnings");
  revalidatePath("/m");
}

/** Yangi seans qo'shish */
async function createSessionImpl(formData: FormData) {
  const user = await requireUser();
  if (user.role === "PARENT") throw new Error("Sizda bu amal uchun ruxsat yo'q.");

  const clientId = String(formData.get("clientId") ?? "");
  const specialistId = String(formData.get("specialistId") ?? "");
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const durationMin = Number(formData.get("durationMin") ?? 45);
  const chosenTypeId = String(formData.get("sessionTypeId") ?? "") || null;

  if (!clientId || !specialistId || !startsAtRaw) {
    throw new Error("Mijoz, mutaxassis va vaqtni to'liq kiriting.");
  }

  const startsAt = parseDateInput(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) throw new Error("Vaqt formati noto'g'ri.");

  const [client, specialist] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, branchId: true, fullName: true },
    }),
    prisma.specialist.findUnique({
      where: { id: specialistId },
      select: { id: true, branchId: true, specialization: true },
    }),
  ]);
  if (!client || !specialist) throw new Error("Mijoz yoki mutaxassis topilmadi.");

  if (user.role !== "OWNER" && user.role !== "SPECIALIST" && client.branchId !== user.branchId) {
    throw new Error("Bu mijoz sizning filialingizga tegishli emas.");
  }
  if (user.role === "SPECIALIST" && specialist.id !== user.specialistId) {
    throw new Error("Faqat o'zingizga seans qo'sha olasiz.");
  }
  if (client.branchId !== specialist.branchId) {
    throw new Error("Mijoz va mutaxassis bitta filialda bo'lishi kerak.");
  }
  // Har seans xizmat bilan yoziladi — narx va mutaxassis ulushi xizmatdan.
  // Tanlanmasa mijozga biriktirilgan xizmat olinadi (bittasi bo'lsa).
  let sessionTypeId = chosenTypeId;
  if (!sessionTypeId) {
    const own = await prisma.clientService.findMany({
      where: { clientId, sessionType: { isActive: true } },
      select: { sessionTypeId: true },
    });
    if (own.length === 0) {
      throw new Error("Mijozga xizmat biriktirilmagan — xizmatni tanlang yoki mijoz kartasida biriktiring.");
    }
    if (own.length > 1) throw new Error("Mijozda bir nechta xizmat bor — xizmatni tanlang.");
    sessionTypeId = own[0].sessionTypeId;
  }
  // Begona (boshqa markaz yoki yakka logoped) xizmati bilan narx qo'yib bo'lmasin
  await assertTypeFitsBranch(sessionTypeId, client.branchId);

  // Shu vaqtda mutaxassis yoki mijoz band emasmi? findFirst emas, findMany:
  // birinchi topilgani tugab bo'lgan seans bo'lsa, ustma-ust tushganini o'tkazib yuborardi.
  const end = new Date(startsAt.getTime() + durationMin * 60_000);
  const nearby = await prisma.session.findMany({
    where: {
      OR: [{ specialistId }, { clientId }],
      status: { in: ["PLANNED", "DONE"] },
      startsAt: { gte: new Date(startsAt.getTime() - 12 * 60 * 60_000), lt: end },
    },
    select: { specialistId: true, clientId: true, startsAt: true, durationMin: true },
  });
  const overlaps = nearby.filter(
    (x) => new Date(x.startsAt.getTime() + x.durationMin * 60_000) > startsAt,
  );
  if (overlaps.some((x) => x.specialistId === specialistId)) {
    throw new Error("Mutaxassisning bu vaqti band.");
  }
  if (overlaps.some((x) => x.clientId === clientId)) {
    throw new Error("Mijozning bu vaqtda boshqa seansi bor.");
  }

  // Seans shu xizmatning faol abonementidan yechiladi. Xizmatlar kiritilishidan
  // oldin sotilgan abonementlar yo'nalishga bog'langan — ularda qolgan seanslar
  // kuyib ketmasin, shuning uchun xizmat abonementi bo'lmasa o'shalar olinadi.
  const pkg =
    (await prisma.package.findFirst({
      where: { clientId, sessionTypeId, isActive: true },
      orderBy: { purchasedAt: "desc" },
      select: { id: true },
    })) ??
    (await prisma.package.findFirst({
      where: { clientId, sessionTypeId: null, specialization: specialist.specialization, isActive: true },
      orderBy: { purchasedAt: "desc" },
      select: { id: true },
    }));

  // Pul yetmasa avval ogohlantiriladi; mijoz baribir yozilsa, qarzga kirgani aytiladi
  const type = await prisma.sessionType.findUnique({ where: { id: sessionTypeId }, select: { price: true } });
  const pkgPrice = pkg
    ? (await prisma.package.findUnique({ where: { id: pkg.id }, select: { pricePerSession: true } }))?.pricePerSession
    : undefined;
  const check = await sessionBalance(clientId, pkgPrice ?? type?.price ?? 0);
  const allowDebt = String(formData.get("allowDebt") ?? "") === "1";
  const tt = await getT();
  if (check.short && !allowDebt) {
    throw new ActionError(
      "Mijozning puli yetmaydi: qoldiq {balance}, seans narxi {price}. Baribir yozish uchun tasdiqlang.",
      { balance: tt.money(check.balance), price: tt.money(check.price) },
    );
  }

  await prisma.session.create({
    data: {
      clientId,
      specialistId,
      branchId: client.branchId,
      packageId: pkg?.id ?? null,
      sessionTypeId,
      startsAt,
      durationMin,
      status: "PLANNED",
      price: 0,
      note: String(formData.get("note") ?? "").trim() || null,
    },
  });

  // Mijoz hali bu mutaxassisga va xizmatga biriktirilmagan bo'lsa — biriktiramiz
  await Promise.all([
    prisma.assignment.upsert({
      where: { clientId_specialistId: { clientId, specialistId } },
      create: { clientId, specialistId },
      update: {},
    }),
    prisma.clientService.upsert({
      where: { clientId_sessionTypeId: { clientId, sessionTypeId } },
      create: { clientId, sessionTypeId },
      update: {},
    }),
  ]);

  revalidatePath("/schedule");
  revalidatePath("/");
  revalidatePath(`/clients/${clientId}`);
  // Yashil xabar qo'shish oynasini yopadi (AutoCloseEdits) — seans boshqa
  // haftaga yozilgan bo'lsa ham bajarilgani bilinsin
  if (check.short) {
    await setFlash("Seans yozildi: {name} · {when}. Diqqat: mijoz {debt} qarzga kirdi.", "ok", {
      name: client.fullName,
      when: dateTimeUz(startsAt),
      debt: tt.money(check.debtAfter),
    });
  } else {
    await setFlash("Seans yozildi: {name} · {when}", "ok", {
      name: client.fullName,
      when: dateTimeUz(startsAt),
    });
  }
}

/**
 * Forma yuborilishidan oldin brauzer chaqiradi: mijozning puli yetmasa
 * ogohlantirish matnini qaytaradi (null — hammasi joyida). Matn
 * foydalanuvchining tilida, pul so'm/UZS/сум bilan.
 */
export async function checkSessionBalance(formData: FormData): Promise<{ message: string | null }> {
  const user = await requireUser();
  if (user.role === "PARENT") return { message: null };
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return { message: null };
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, branchId: true },
  });
  if (!client) return { message: null };
  if (user.role !== "OWNER" && user.role !== "SPECIALIST" && client.branchId !== user.branchId) {
    return { message: null };
  }

  let sessionTypeId = String(formData.get("sessionTypeId") ?? "") || null;
  if (!sessionTypeId) {
    const own = await prisma.clientService.findMany({
      where: { clientId, sessionType: { isActive: true } },
      select: { sessionTypeId: true },
    });
    // Xizmat aniq emas bo'lsa narx ham noma'lum — xatoni yozish amalining o'zi aytadi
    if (own.length !== 1) return { message: null };
    sessionTypeId = own[0].sessionTypeId;
  }
  const [type, pkg] = await Promise.all([
    prisma.sessionType.findUnique({ where: { id: sessionTypeId }, select: { price: true } }),
    prisma.package.findFirst({
      where: { clientId, sessionTypeId, isActive: true },
      orderBy: { purchasedAt: "desc" },
      select: { pricePerSession: true },
    }),
  ]);
  const check = await sessionBalance(clientId, pkg?.pricePerSession ?? type?.price ?? 0);
  if (!check.short) return { message: null };

  const t = await getT();
  return {
    message: t(
      "Mijozning puli yetmaydi.\nQoldiq (rejadagi seanslarni hisobga olganda): {balance}\nYangi seans narxi: {price}\nBaribir yozsangiz, mijoz {debt} qarzga kiradi.\n\nBaribir yozilsinmi?",
      { balance: t.money(check.balance), price: t.money(check.price), debt: t.money(check.debtAfter) },
    ),
  };
}

/** Seansni o'chirish (faqat rejadagisini) */
async function deleteSessionImpl(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  const { session } = await assertCanEdit(sessionId);

  const current = await prisma.session.findUniqueOrThrow({
    where: { id: session.id },
    select: { status: true, clientId: true },
  });
  if (current.status !== "PLANNED") {
    throw new Error("Faqat rejadagi seansni o'chirish mumkin.");
  }

  await prisma.session.delete({ where: { id: sessionId } });
  revalidatePath("/schedule");
  revalidatePath(`/clients/${current.clientId}`);
}

/* Tekshiruv xatolari foydalanuvchiga xabar bo'lib ko'rinishi uchun */
export const setSessionStatus = withFlash(setSessionStatusImpl);
export const createSession = withFlash(createSessionImpl);
export const deleteSession = withFlash(deleteSessionImpl);
