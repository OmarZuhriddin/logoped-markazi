"use server";

import { parseDateInput } from "@/lib/format";
import { revalidatePath } from "next/cache";
import { withFlash } from "@/lib/action";
import { setFlash } from "@/lib/flash";
import { getT } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, type CurrentUser, isFrontDesk, isSolo } from "@/lib/auth";
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_KEYS,
  PAYMENT_METHOD_KEYS,
  type ClientStatus,
  type PaymentMethod,
} from "@/lib/constants";

/**
 * Qabulxona ishi: mijoz qo'shish, abonement sotish, to'lov qabul qilish.
 * Markaz egasi, filial admini va qabulxona xodimi qila oladi.
 */
async function requireFrontDesk(): Promise<CurrentUser> {
  const user = await requireUser();
  // Yakka mutaxassis o'ziga qabulxona ham: mijozini o'zi qo'shadi, to'lovini
  // o'zi yozadi. Ko'rish doirasi baribir o'z mijozlari bilan chegaralangan.
  if (!isFrontDesk(user)) {
    throw new Error("Sizda bu amal uchun ruxsat yo'q.");
  }
  return user;
}

/** Faqat markaz egasi va filial admini — pulni o'chirish kabi qaytarib bo'lmas amallar uchun */
async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "OWNER" && user.role !== "BRANCH_ADMIN") {
    throw new Error("Sizda bu amal uchun ruxsat yo'q.");
  }
  return user;
}

async function assertClientAccess(user: CurrentUser, clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      fullName: true,
      branchId: true,
      parentUserId: true,
      parentName: true,
      parentPhone: true,
    },
  });
  if (!client) throw new Error("Mijoz topilmadi.");
  if (user.role !== "OWNER" && client.branchId !== user.branchId) {
    throw new Error("Bu mijoz sizning filialingizga tegishli emas.");
  }
  return client;
}

/**
 * `message` — to'liq jumla, chunki u lug'atdan tarjima qilinadi. Bo'lak-bo'lak
 * yig'ilgan matnni ("{maydon} to'g'ri kiritilmagan") tarjima qilib bo'lmaydi:
 * maydon nomi o'zbekcha qolib ketardi.
 */
function parseAmount(raw: FormDataEntryValue | null, message: string): number {
  // "150 000" yoki "150000" ko'rinishini ham qabul qiladi
  const n = Number(String(raw ?? "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(n) || n <= 0) throw new Error(message);
  return Math.round(n);
}

/** Yangi mijoz (bola) qo'shish */
async function createClientImpl(formData: FormData) {
  const user = await requireFrontDesk();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const birthDateRaw = String(formData.get("birthDate") ?? "");
  const parentName = String(formData.get("parentName") ?? "").trim();
  const parentPhone = String(formData.get("parentPhone") ?? "").trim();
  const branchId =
    user.role === "OWNER" ? String(formData.get("branchId") ?? "") : (user.branchId ?? "");

  if (!fullName || !birthDateRaw || !parentName || !parentPhone || !branchId) {
    throw new Error("Majburiy maydonlarni to'liq to'ldiring.");
  }

  const birthDate = parseDateInput(birthDateRaw);
  if (Number.isNaN(birthDate.getTime())) throw new Error("Tug'ilgan sana noto'g'ri.");

  // Ota-ona akkaunti doim ochiladi: u kabinetga faqat Telegram orqali,
  // raqamini ulashib kiradi, bot esa raqamni foydalanuvchilar orasidan
  // qidiradi. Parol yo'q — ota-onaga parol bilan kirish yopiq.
  let parentUserId: string;
  const existingParent = await prisma.user.findUnique({ where: { phone: parentPhone } });
  if (existingParent) {
    if (existingParent.role !== "PARENT") {
      throw new Error("Bu telefon raqam markaz xodimiga tegishli.");
    }
    parentUserId = existingParent.id;
  } else {
    const created = await prisma.user.create({
      data: {
        phone: parentPhone,
        fullName: parentName,
        passwordHash: "",
        role: "PARENT",
        branchId,
      },
    });
    parentUserId = created.id;
  }

  const client = await prisma.client.create({
    data: {
      fullName,
      birthDate,
      gender: String(formData.get("gender") ?? "") || null,
      branchId,
      parentUserId,
      parentName,
      parentPhone,
      diagnosis: String(formData.get("diagnosis") ?? "").trim() || null,
      note: String(formData.get("note") ?? "").trim() || null,
      status: "ACTIVE",
      // Markazda abonement yo'q — har bir seans alohida hisoblanadi
      billingType: "DAILY",
    },
  });

  // Yakka mutaxassis o'z mijozini qo'shdi — darhol o'ziga biriktiramiz,
  // aks holda mijoz uning ro'yxatida ko'rinmaydi (doira biriktirishga tayanadi)
  if (isSolo(user) && user.specialistId) {
    await prisma.assignment.create({
      data: { clientId: client.id, specialistId: user.specialistId },
    });
  }

  // Xizmat darhol biriktirilsa, mijozga keyin seans yozish uchun boshqa
  // sahifaga o'tish shart emas
  const sessionTypeId = String(formData.get("sessionTypeId") ?? "");
  if (sessionTypeId) {
    await serviceForClient(sessionTypeId, client);
    await prisma.clientService.create({ data: { clientId: client.id, sessionTypeId } });
  }

  revalidatePath("/clients");
  revalidatePath("/");
  await setFlash("{name} qo'shildi.", "ok", { name: fullName });
  redirect(`/clients/${client.id}`);
}

/**
 * Mijoz kartasini tahrirlash.
 *
 * Ota-ona telefoni o'zgarsa, eski ota-ona akkauntining raqamini almashtirmaymiz:
 * bitta akkauntga bir necha farzand bog'langan bo'lishi mumkin (aka-uka), va
 * uning raqamini o'zgartirish boshqasining Telegram ulanishini uzib qo'yardi.
 * Shuning uchun yangi raqam bo'yicha akkaunt topiladi yoki ochiladi, mijoz esa
 * o'shanga ulanadi.
 */
async function updateClientImpl(formData: FormData) {
  const user = await requireFrontDesk();
  const clientId = String(formData.get("clientId") ?? "");
  const client = await assertClientAccess(user, clientId);

  const fullName = String(formData.get("fullName") ?? "").trim();
  const birthDateRaw = String(formData.get("birthDate") ?? "");
  const parentName = String(formData.get("parentName") ?? "").trim();
  const parentPhone = String(formData.get("parentPhone") ?? "").trim();
  const branchId =
    user.role === "OWNER" ? String(formData.get("branchId") ?? "") || client.branchId : client.branchId;

  if (!fullName || !birthDateRaw || !parentName || !parentPhone) {
    throw new Error("Majburiy maydonlarni to'liq to'ldiring.");
  }
  const birthDate = parseDateInput(birthDateRaw);
  if (Number.isNaN(birthDate.getTime())) throw new Error("Tug'ilgan sana noto'g'ri.");

  let parentUserId = client.parentUserId;
  if (parentPhone !== client.parentPhone) {
    const existing = await prisma.user.findUnique({ where: { phone: parentPhone } });
    if (existing) {
      if (existing.role !== "PARENT") {
        throw new Error("Bu telefon raqam markaz xodimiga tegishli.");
      }
      parentUserId = existing.id;
    } else {
      const created = await prisma.user.create({
        data: {
          phone: parentPhone,
          fullName: parentName,
          passwordHash: "",
          role: "PARENT",
          branchId,
        },
      });
      parentUserId = created.id;
    }
  } else if (parentUserId && parentName !== client.parentName) {
    // Raqam o'sha — demak o'sha odam, ismidagi xato tuzatilgan
    await prisma.user.update({ where: { id: parentUserId }, data: { fullName: parentName } });
  }

  await prisma.client.update({
    where: { id: clientId },
    data: {
      fullName,
      birthDate,
      gender: String(formData.get("gender") ?? "") || null,
      branchId,
      parentUserId,
      parentName,
      parentPhone,
      diagnosis: String(formData.get("diagnosis") ?? "").trim() || null,
      note: String(formData.get("note") ?? "").trim() || null,
    },
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath("/schedule");
  revalidatePath("/");
  await setFlash("{name} saqlandi.", "ok", { name: fullName });
}

/** Mijoz holatini o'zgartirish: Faol / To'xtatilgan / Arxiv */
async function setClientStatusImpl(formData: FormData) {
  const user = await requireFrontDesk();
  const clientId = String(formData.get("clientId") ?? "");
  const status = String(formData.get("status") ?? "") as ClientStatus;
  if (!CLIENT_STATUS_KEYS.includes(status)) throw new Error("Holat noto'g'ri.");

  await assertClientAccess(user, clientId);
  const client = await prisma.client.update({
    where: { id: clientId },
    data: { status },
    select: { fullName: true },
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  // Ro'yxat holat bo'yicha saralangan — qator boshqa joyga ko'chib ketadi,
  // xabarsiz "bosildimi?" degan savol qoladi
  await setFlash("{name}: {status}", "ok", {
    name: client.fullName,
    status: (await getT())(CLIENT_STATUSES[status]),
  });
}

/**
 * Egani boshqa rollardan ajratib turadi: mijozni o'chirish va shaxsiy
 * ma'lumotni tozalash — qaytarib bo'lmaydigan amallar, ularni qabulxona
 * xodimi yoki filial admini qila olmaydi.
 */
async function requireOwnerFor(clientId: string) {
  const user = await requireUser();
  if (user.role !== "OWNER") throw new Error("Bu amalni faqat markaz egasi bajara oladi.");
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, fullName: true, parentUserId: true, birthDate: true },
  });
  if (!client) throw new Error("Mijoz topilmadi.");

  // Tasdiq: bolaning ismini qo'lda yozdiramiz. Tugmani bexosdan bosish
  // mumkin, ismni bexosdan yozib bo'lmaydi.
  return client;
}

function assertNameTyped(formData: FormData, fullName: string) {
  const typed = String(formData.get("confirmName") ?? "").trim();
  if (typed.toLowerCase() !== fullName.trim().toLowerCase()) {
    throw new Error("Tasdiqlash uchun bolaning ism-familiyasini aynan yozing.");
  }
}

/**
 * Ota-ona akkaunti boshqa farzandga bog'lanmagan bo'lsa, u ham keraksiz
 * qoladi — o'chiramiz. Aka-uka bir akkauntni bo'lishishi mumkin, shuning
 * uchun avval tekshiramiz.
 */
async function removeOrphanParent(parentUserId: string | null, exceptClientId?: string) {
  if (!parentUserId) return;
  const parent = await prisma.user.findUnique({
    where: { id: parentUserId },
    select: { id: true, role: true },
  });
  if (!parent || parent.role !== "PARENT") return;
  const others = await prisma.client.count({
    where: { parentUserId, ...(exceptClientId ? { NOT: { id: exceptClientId } } : {}) },
  });
  if (others === 0) await prisma.user.delete({ where: { id: parentUserId } });
}

/**
 * Shaxsiy ma'lumotni tozalash.
 *
 * Bolaning va ota-onasining ismi, telefoni, tashxisi o'chadi; seans va
 * to'lov yozuvlari raqam bo'lib qoladi. Shunda kassa va mutaxassis ish haqi
 * hisobi o'zgarmaydi, lekin bazada bolaning shaxsiy ma'lumoti qolmaydi.
 *
 * Tug'ilgan sana yil boshiga keltiriladi: aniq sana ism bo'lmasa ham
 * odamni tanishga yordam beradi.
 */
async function anonymizeClientImpl(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  const client = await requireOwnerFor(clientId);
  assertNameTyped(formData, client.fullName);

  const yearStart = new Date(Date.UTC(client.birthDate.getUTCFullYear(), 0, 1));

  await prisma.$transaction([
    // Eslatma matnida bolaning ismi bor — ular ham qolmasin
    prisma.notification.deleteMany({ where: { clientId } }),
    // Qabul yozuvi alohida jadvalda, unda ham ism va telefon bor
    prisma.intake.updateMany({
      where: { clientId },
      data: { childName: "O'chirilgan mijoz", parentName: "—", parentPhone: "—" },
    }),
    prisma.client.update({
      where: { id: clientId },
      data: {
        fullName: "O'chirilgan mijoz",
        parentName: "—",
        parentPhone: "—",
        diagnosis: null,
        note: null,
        gender: null,
        birthDate: yearStart,
        parentUserId: null,
        status: "ARCHIVED",
      },
    }),
  ]);

  await removeOrphanParent(client.parentUserId, clientId);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath("/");
  await setFlash("Shaxsiy ma'lumot tozalandi.", "ok");
}

/**
 * Mijozni butunlay o'chirish.
 *
 * Seans, to'lov, abonement, eslatma — hammasi birga ketadi (bazada chet el
 * kaliti shunday sozlangan). Ya'ni o'tgan oylardagi hisobot raqamlari ham
 * o'zgaradi; shuning uchun bu amal faqat egada va ism yozib tasdiqlanadi.
 */
async function deleteClientImpl(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  const client = await requireOwnerFor(clientId);
  assertNameTyped(formData, client.fullName);

  // Qabul yozuvi mijozga bog'langan bo'lishi mumkin. U o'chmaydi:
  // konsultatsiya puli kassaga tushgan va hisobotda qolishi kerak.
  await prisma.intake.updateMany({ where: { clientId }, data: { clientId: null } });
  await prisma.client.delete({ where: { id: clientId } });
  await removeOrphanParent(client.parentUserId);

  revalidatePath("/clients");
  revalidatePath("/schedule");
  revalidatePath("/payments");
  revalidatePath("/reports");
  revalidatePath("/");
  await setFlash("{name} butunlay o'chirildi.", "ok", { name: client.fullName });
  redirect("/clients");
}

/** Mijozni mutaxassisga biriktirish */
async function assignSpecialistImpl(formData: FormData) {
  const user = await requireFrontDesk();
  const clientId = String(formData.get("clientId") ?? "");
  const specialistId = String(formData.get("specialistId") ?? "");
  if (!specialistId) throw new Error("Mutaxassisni tanlang.");

  const client = await assertClientAccess(user, clientId);
  const specialist = await prisma.specialist.findUnique({
    where: { id: specialistId },
    select: { branchId: true },
  });
  if (!specialist) throw new Error("Mutaxassis topilmadi.");
  if (specialist.branchId !== client.branchId) {
    throw new Error("Mutaxassis boshqa filialda ishlaydi.");
  }

  await prisma.assignment.upsert({
    where: { clientId_specialistId: { clientId, specialistId } },
    create: { clientId, specialistId },
    update: {},
  });

  revalidatePath(`/clients/${clientId}`);
}

/** Biriktirishni olib tashlash */
async function unassignSpecialistImpl(formData: FormData) {
  const user = await requireFrontDesk();
  const clientId = String(formData.get("clientId") ?? "");
  const specialistId = String(formData.get("specialistId") ?? "");
  await assertClientAccess(user, clientId);

  await prisma.assignment
    .delete({ where: { clientId_specialistId: { clientId, specialistId } } })
    .catch(() => null);

  revalidatePath(`/clients/${clientId}`);
}

/**
 * Xizmat mijozning filialiga mosmi: markaz xizmati markaz mijoziga, yakka
 * logoped xizmati faqat uning o'z mijoziga. Begona narx bilan abonement
 * yoki seans yozib bo'lmasin.
 */
async function serviceForClient(sessionTypeId: string, client: { branchId: string }) {
  const [type, branch] = await Promise.all([
    prisma.sessionType.findUnique({
      where: { id: sessionTypeId },
      select: { id: true, name: true, price: true, branchId: true, isActive: true },
    }),
    prisma.branch.findUnique({ where: { id: client.branchId }, select: { id: true, isSolo: true } }),
  ]);
  if (!type || !type.isActive || !branch) throw new Error("Xizmat topilmadi.");
  if ((branch.isSolo ? branch.id : null) !== type.branchId) throw new Error("Xizmat topilmadi.");
  return type;
}

/** Mijozga xizmat biriktirish — seans yozilganda shu xizmat o'zi olinadi */
async function assignServiceImpl(formData: FormData) {
  const user = await requireFrontDesk();
  const clientId = String(formData.get("clientId") ?? "");
  const sessionTypeId = String(formData.get("sessionTypeId") ?? "");
  if (!sessionTypeId) throw new Error("Xizmatni tanlang.");
  const client = await assertClientAccess(user, clientId);
  await serviceForClient(sessionTypeId, client);
  await prisma.clientService.upsert({
    where: { clientId_sessionTypeId: { clientId, sessionTypeId } },
    create: { clientId, sessionTypeId },
    update: {},
  });
  revalidatePath(`/clients/${clientId}`);
  await setFlash("Xizmat biriktirildi.", "ok");
}

/** Xizmatni mijozdan olib tashlash (o'tgan seanslar va abonementlar qoladi) */
async function unassignServiceImpl(formData: FormData) {
  const user = await requireFrontDesk();
  const clientId = String(formData.get("clientId") ?? "");
  const sessionTypeId = String(formData.get("sessionTypeId") ?? "");
  await assertClientAccess(user, clientId);
  await prisma.clientService.deleteMany({ where: { clientId, sessionTypeId } });
  revalidatePath(`/clients/${clientId}`);
}

/** To'lov qabul qilish */
/**
 * Summani mijozning qarzi bor abonementlariga eng eskisidan boshlab bo'ladi.
 * Ortgan qismi abonementsiz (oldindan to'lov) bo'lib qoladi.
 *
 * `excludePaymentId` — tahrirlanayotgan to'lovning o'zi qarzni hisoblashda
 * "to'langan" bo'lib sanalmasin.
 */
async function splitOverPackages(
  clientId: string,
  amount: number,
  excludePaymentId?: string,
): Promise<{ packageId: string | null; amount: number }[]> {
  const packages = await prisma.package.findMany({
    where: { clientId, isActive: true },
    orderBy: { purchasedAt: "asc" },
    include: {
      payments: {
        where: excludePaymentId ? { id: { not: excludePaymentId } } : undefined,
        select: { amount: true },
      },
    },
  });

  let left = amount;
  const rows: { packageId: string | null; amount: number }[] = [];
  for (const p of packages) {
    if (left <= 0) break;
    const paid = p.payments.reduce((sum, x) => sum + x.amount, 0);
    const debt = p.totalSessions * p.pricePerSession - paid;
    if (debt <= 0) continue;
    const part = Math.min(debt, left);
    rows.push({ packageId: p.id, amount: part });
    left -= part;
  }
  if (left > 0) rows.push({ packageId: null, amount: left });
  return rows;
}

async function addPaymentImpl(formData: FormData) {
  const user = await requireFrontDesk();
  const clientId = String(formData.get("clientId") ?? "");
  // Ro'yxatda oldindan hech kim tanlanmaydi — pul tasodifan birinchi turgan
  // mijozga yozilib ketmasligi uchun. Tanlanmagan bo'lsa aniq aytamiz.
  if (!clientId) throw new Error("Mijozni tanlang.");
  const amount = parseAmount(formData.get("amount"), "Summa to'g'ri kiritilmagan.");
  const method = String(formData.get("method") ?? "CASH") as PaymentMethod;
  if (!PAYMENT_METHOD_KEYS.includes(method)) throw new Error("To'lov usuli noto'g'ri.");

  const client = await assertClientAccess(user, clientId);
  const packageId = String(formData.get("packageId") ?? "") || null;

  const paidAtRaw = String(formData.get("paidAt") ?? "");
  const paidAtParsed = paidAtRaw ? new Date(paidAtRaw) : new Date();
  const paidAt = Number.isNaN(paidAtParsed.getTime()) ? new Date() : paidAtParsed;
  const note = String(formData.get("note") ?? "").trim() || null;

  const base = { clientId, branchId: client.branchId, method, paidAt, note };

  if (packageId) {
    // Admin aniq abonementni tanlagan
    const pkg = await prisma.package.findUnique({
      where: { id: packageId },
      select: { clientId: true },
    });
    if (!pkg || pkg.clientId !== clientId) throw new Error("Abonement bu mijozga tegishli emas.");

    await prisma.payment.create({ data: { ...base, packageId, amount } });
  } else {
    // Abonement tanlanmagan: summa qarzi bor abonementlarga eng eskisidan
    // boshlab taqsimlanadi, ortgani esa oldindan to'lov sifatida yoziladi.
    const rows = await splitOverPackages(clientId, amount);
    await prisma.$transaction(
      rows.map((r) => prisma.payment.create({ data: { ...base, ...r } })),
    );
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/payments");
  revalidatePath("/");
  revalidatePath("/reports");
  await setFlash("To'lov qabul qilindi: {name} · {sum}", "ok", {
    name: client.fullName,
    sum: (await getT()).money(amount),
  });
}

/** To'lovni o'chirish (xato kiritilgan bo'lsa) */
async function deletePaymentImpl(formData: FormData) {
  const user = await requireAdmin();
  const paymentId = String(formData.get("paymentId") ?? "");
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { clientId: true, branchId: true },
  });
  if (!payment) throw new Error("To'lov topilmadi.");
  if (user.role !== "OWNER" && payment.branchId !== user.branchId) {
    throw new Error("Bu to'lov sizning filialingizga tegishli emas.");
  }

  await prisma.payment.delete({ where: { id: paymentId } });

  revalidatePath(`/clients/${payment.clientId}`);
  revalidatePath("/payments");
  revalidatePath("/reports");
}


/**
 * Noto'g'ri kiritilgan to'lovni tuzatish.
 *
 * Kim: qo'shgan kishi (qabulxona ham) — faqat o'sha kuni, xato odatda darhol
 * ko'rinadi. Eski to'lovni keyin o'zgartirish esa kassa hisobotini orqaga
 * qarab o'zgartiradi, shuning uchun u faqat ega va filial adminiga ochiq.
 *
 * Mijoz almashtirilsa, to'lov eski abonementda qolib ketmasligi kerak:
 * yangi mijozning qarzi bor abonementlariga xuddi yangi to'lovdek
 * taqsimlanadi. Mijoz o'sha bo'lsa, abonement bog'lanishi o'zgarmaydi.
 */
async function updatePaymentImpl(formData: FormData) {
  const user = await requireFrontDesk();
  const paymentId = String(formData.get("paymentId") ?? "");
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error("To'lov topilmadi.");
  if (user.role !== "OWNER" && payment.branchId !== user.branchId) {
    throw new Error("Bu to'lov sizning filialingizga tegishli emas.");
  }
  if (user.role === "RECEPTION" && !sameDay(payment.createdAt, new Date())) {
    throw new Error("Oldingi kunlardagi to'lovni faqat markaz egasi yoki filial admini tuzata oladi.");
  }

  const amount = parseAmount(formData.get("amount"), "Summa to'g'ri kiritilmagan.");
  const method = String(formData.get("method") ?? payment.method) as PaymentMethod;
  if (!PAYMENT_METHOD_KEYS.includes(method)) throw new Error("To'lov usuli noto'g'ri.");
  const paidAtRaw = String(formData.get("paidAt") ?? "");
  const paidAtParsed = paidAtRaw ? new Date(paidAtRaw) : payment.paidAt;
  if (Number.isNaN(paidAtParsed.getTime())) throw new Error("Sana noto'g'ri.");
  // Faqat sana kiritiladi — asl vaqtni saqlaymiz, aks holda ro'yxat tartibi buziladi
  const paidAt = new Date(paidAtParsed);
  paidAt.setHours(payment.paidAt.getHours(), payment.paidAt.getMinutes(), payment.paidAt.getSeconds());
  const note = String(formData.get("note") ?? "").trim() || null;
  const clientId = String(formData.get("clientId") ?? "") || payment.clientId;

  if (clientId === payment.clientId) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { amount, method, paidAt, note },
    });
  } else {
    const client = await assertClientAccess(user, clientId);
    const rows = await splitOverPackages(clientId, amount);
    await prisma.$transaction([
      prisma.payment.delete({ where: { id: paymentId } }),
      ...rows.map((r) =>
        prisma.payment.create({
          data: { clientId, branchId: client.branchId, method, paidAt, note, ...r },
        }),
      ),
    ]);
    revalidatePath(`/clients/${clientId}`);
  }

  revalidatePath(`/clients/${payment.clientId}`);
  revalidatePath("/payments");
  revalidatePath("/reports");
  revalidatePath("/");
  await setFlash("To'lov tuzatildi.", "ok");
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/* Tekshiruv xatolari foydalanuvchiga xabar bo'lib ko'rinishi uchun */
export const createClient = withFlash(createClientImpl);
export const updateClient = withFlash(updateClientImpl);
export const setClientStatus = withFlash(setClientStatusImpl);
export const anonymizeClient = withFlash(anonymizeClientImpl);
export const deleteClient = withFlash(deleteClientImpl);
export const assignSpecialist = withFlash(assignSpecialistImpl);
export const unassignSpecialist = withFlash(unassignSpecialistImpl);
export const assignService = withFlash(assignServiceImpl);
export const unassignService = withFlash(unassignServiceImpl);
export const addPayment = withFlash(addPaymentImpl);
export const deletePayment = withFlash(deletePaymentImpl);
export const updatePayment = withFlash(updatePaymentImpl);
