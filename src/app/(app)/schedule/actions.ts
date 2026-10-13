"use server";

import { parseDateInput } from "@/lib/format";
import { revalidatePath } from "next/cache";
import { withFlash } from "@/lib/action";
import { setFlash } from "@/lib/flash";
import { dateTimeUz } from "@/lib/format";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { SESSION_STATUS_KEYS, type SessionStatus } from "@/lib/constants";
import { queueSessionDone, sendPending } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { assertTypeFitsBranch } from "@/lib/session-types";

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

  // Shu vaqtda mutaxassis band emasmi?
  const end = new Date(startsAt.getTime() + durationMin * 60_000);
  const clash = await prisma.session.findFirst({
    where: {
      specialistId,
      status: { in: ["PLANNED", "DONE"] },
      startsAt: { gte: new Date(startsAt.getTime() - 3 * 60 * 60_000), lt: end },
    },
    select: { startsAt: true, durationMin: true },
  });
  if (clash) {
    const clashEnd = new Date(clash.startsAt.getTime() + clash.durationMin * 60_000);
    if (clashEnd > startsAt) throw new Error("Mutaxassisning bu vaqti band.");
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
  await setFlash("Seans yozildi: {name} · {when}", "ok", {
    name: client.fullName,
    when: dateTimeUz(startsAt),
  });
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
