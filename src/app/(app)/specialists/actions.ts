"use server";

import { parseDateInput } from "@/lib/format";
import { revalidatePath } from "next/cache";
import { withFlash } from "@/lib/action";
import { setFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireUser, type CurrentUser } from "@/lib/auth";
import { PAYMENT_METHOD_KEYS, normalizeSpecialization } from "@/lib/constants";

async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "OWNER" && user.role !== "BRANCH_ADMIN") {
    throw new Error("Sizda bu amal uchun ruxsat yo'q.");
  }
  return user;
}

/** Yangi mutaxassis (login bilan) qo'shish */
async function createSpecialistImpl(formData: FormData) {
  const user = await requireAdmin();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const specialization = normalizeSpecialization(String(formData.get("specialization") ?? ""));
  const salaryPercent = Number(formData.get("salaryPercent") ?? 40);
  const branchId =
    user.role === "OWNER" ? String(formData.get("branchId") ?? "") : (user.branchId ?? "");

  if (!fullName || !phone || !branchId) throw new Error("Ism, telefon va filial majburiy.");
  if (!specialization) throw new Error("Mutaxassislikni yozing.");
  if (specialization.length > 60) throw new Error("Mutaxassislik 60 belgidan oshmasin.");
  if (password.length < 5) throw new Error("Parol kamida 5 belgidan bo'lsin.");
  if (!Number.isInteger(salaryPercent) || salaryPercent < 0 || salaryPercent > 100) {
    throw new Error("Ish haqi foizi 0 dan 100 gacha bo'lishi kerak.");
  }

  const exists = await prisma.user.findUnique({ where: { phone } });
  if (exists) throw new Error("Bu telefon raqam allaqachon ro'yxatda.");

  const created = await prisma.user.create({
    data: {
      phone,
      fullName,
      passwordHash: hashPassword(password),
      role: "SPECIALIST",
      branchId,
    },
  });

  await prisma.specialist.create({
    data: { userId: created.id, branchId, specialization, salaryPercent },
  });

  revalidatePath("/specialists");
  revalidatePath("/");
  await setFlash("{name} qo'shildi.", "ok", { name: fullName });
}

/**
 * Mutaxassis ma'lumotini o'zgartirish.
 *
 * Nega kerak: ism xato yozilgan bo'lishi, telefon almashishi, mutaxassislik
 * yoki filial o'zgarishi mumkin. Yangisini ochib, eskisini o'chirish esa
 * jadval, mijoz va ish haqi tarixini uzib qo'yadi.
 *
 * Parol ixtiyoriy: bo'sh qoldirilsa, eskisi qoladi.
 */
async function updateSpecialistImpl(formData: FormData) {
  const user = await requireAdmin();
  const specialistId = String(formData.get("specialistId") ?? "");

  const sp = await prisma.specialist.findUnique({
    where: { id: specialistId },
    select: { branchId: true, userId: true },
  });
  if (!sp) throw new Error("Mutaxassis topilmadi.");
  if (user.role === "BRANCH_ADMIN" && sp.branchId !== user.branchId) {
    throw new Error("Bu mutaxassis sizning filialingizda ishlamaydi.");
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const specialization = normalizeSpecialization(String(formData.get("specialization") ?? ""));
  // Ulush endi xizmatda turadi (Sozlamalar → Xizmatlar). Xodimdagi foiz faqat
  // xizmatsiz eski seanslar uchun qolgan — forma uni yubormasa, tegilmaydi.
  const percentRaw = formData.get("salaryPercent");
  const salaryPercent = percentRaw === null ? undefined : Number(percentRaw);
  // Filial adminlari xodimni boshqa filialga o'tkaza olmaydi
  const branchId =
    user.role === "OWNER" ? String(formData.get("branchId") ?? "") || sp.branchId : sp.branchId;

  if (!fullName || !phone) throw new Error("Ism va telefon majburiy.");
  if (!specialization) throw new Error("Mutaxassislikni yozing.");
  if (specialization.length > 60) throw new Error("Mutaxassislik 60 belgidan oshmasin.");
  if (
    salaryPercent !== undefined &&
    (!Number.isInteger(salaryPercent) || salaryPercent < 0 || salaryPercent > 100)
  ) {
    throw new Error("Ish haqi foizi 0 dan 100 gacha bo'lishi kerak.");
  }
  if (password && password.length < 5) throw new Error("Parol kamida 5 belgidan bo'lsin.");

  const taken = await prisma.user.findUnique({ where: { phone } });
  if (taken && taken.id !== sp.userId) throw new Error("Bu telefon raqam allaqachon ro'yxatda.");

  await prisma.user.update({
    where: { id: sp.userId },
    data: {
      fullName,
      phone,
      branchId,
      ...(password ? { passwordHash: hashPassword(password) } : {}),
    },
  });
  await prisma.specialist.update({
    where: { id: specialistId },
    data: { specialization, salaryPercent, branchId },
  });

  revalidatePath("/specialists");
  revalidatePath("/schedule");
  revalidatePath("/clients");
  revalidatePath("/reports");
  await setFlash("{name} saqlandi.", "ok", { name: fullName });
}

/** Qabulxona xodimining ma'lumotini o'zgartirish */
async function updateReceptionImpl(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, branchId: true },
  });
  if (!target || target.role !== "RECEPTION") throw new Error("Xodim topilmadi.");
  if (admin.role === "BRANCH_ADMIN" && target.branchId !== admin.branchId) {
    throw new Error("Bu xodim sizning filialingizda ishlamaydi.");
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const branchId =
    admin.role === "OWNER"
      ? String(formData.get("branchId") ?? "") || target.branchId
      : target.branchId;

  if (!fullName || !phone) throw new Error("Ism va telefon majburiy.");
  if (password && password.length < 5) throw new Error("Parol kamida 5 belgidan bo'lsin.");

  const taken = await prisma.user.findUnique({ where: { phone } });
  if (taken && taken.id !== userId) throw new Error("Bu telefon raqam allaqachon ro'yxatda.");

  await prisma.user.update({
    where: { id: userId },
    data: {
      fullName,
      phone,
      branchId,
      ...(password ? { passwordHash: hashPassword(password) } : {}),
    },
  });

  revalidatePath("/specialists");
  await setFlash("{name} saqlandi.", "ok", { name: fullName });
}

/** Ishdan bo'shatish / qaytarish */
async function toggleSpecialistActiveImpl(formData: FormData) {
  const user = await requireAdmin();
  const specialistId = String(formData.get("specialistId") ?? "");

  const sp = await prisma.specialist.findUnique({
    where: { id: specialistId },
    select: { branchId: true, isActive: true, userId: true },
  });
  if (!sp) throw new Error("Mutaxassis topilmadi.");
  if (user.role === "BRANCH_ADMIN" && sp.branchId !== user.branchId) {
    throw new Error("Bu mutaxassis sizning filialingizda ishlamaydi.");
  }

  await prisma.specialist.update({
    where: { id: specialistId },
    data: { isActive: !sp.isActive },
  });
  await prisma.user.update({ where: { id: sp.userId }, data: { isActive: !sp.isActive } });

  revalidatePath("/specialists");
}

/** Mutaxassisga ish haqi to'lab berish */
async function paySalaryImpl(formData: FormData) {
  const user = await requireAdmin();
  const specialistId = String(formData.get("specialistId") ?? "");

  const amount = Math.round(Number(String(formData.get("amount") ?? "").replace(/[^\d]/g, "")));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Summa to'g'ri kiritilmagan.");

  const method = String(formData.get("method") ?? "CASH");
  if (!(PAYMENT_METHOD_KEYS as string[]).includes(method)) throw new Error("To'lov usuli noto'g'ri.");

  const sp = await prisma.specialist.findUnique({
    where: { id: specialistId },
    select: { branchId: true },
  });
  if (!sp) throw new Error("Mutaxassis topilmadi.");
  if (user.role === "BRANCH_ADMIN" && sp.branchId !== user.branchId) {
    throw new Error("Bu mutaxassis sizning filialingizda ishlamaydi.");
  }

  const paidAtRaw = String(formData.get("paidAt") ?? "");
  const paidAt = paidAtRaw ? parseDateInput(paidAtRaw) : new Date();

  await prisma.salaryPayout.create({
    data: {
      specialistId,
      branchId: sp.branchId,
      amount,
      method,
      paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
      note: String(formData.get("note") ?? "").trim() || null,
      createdById: user.id,
    },
  });

  revalidatePath("/specialists");
  revalidatePath("/earnings");
  revalidatePath("/reports");
}

/** Xato kiritilgan ish haqi to'lovini o'chirish */
async function deletePayoutImpl(formData: FormData) {
  const user = await requireAdmin();
  const payoutId = String(formData.get("payoutId") ?? "");

  const payout = await prisma.salaryPayout.findUnique({
    where: { id: payoutId },
    select: { branchId: true },
  });
  if (!payout) throw new Error("To'lov topilmadi.");
  if (user.role === "BRANCH_ADMIN" && payout.branchId !== user.branchId) {
    throw new Error("Bu to'lov sizning filialingizga tegishli emas.");
  }

  await prisma.salaryPayout.delete({ where: { id: payoutId } });
  revalidatePath("/specialists");
  revalidatePath("/earnings");
}

/** Faqat markaz egasi — egalik akkauntlari ustida ish yuritadi */
async function requireOwner(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "OWNER") throw new Error("Bu amalni faqat markaz egasi bajara oladi.");
  return user;
}

/**
 * Ikkinchi "markaz egasi" akkauntini ochish.
 *
 * Nega kerak: markazni ikki kishi birga yuritishi mumkin (hamkorlar, er-xotin,
 * direktor va moliyachi). Bitta akkauntni bo'lishib ishlatish esa kim nima
 * qilganini ajratib bo'lmaydigan qiladi.
 *
 * Egada filial bo'lmaydi (`branchId: null`) — u hamma filialni ko'radi.
 */
async function createOwnerImpl(formData: FormData) {
  await requireOwner();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !phone) throw new Error("Ism va telefon majburiy.");
  if (password.length < 5) throw new Error("Parol kamida 5 belgidan bo'lsin.");

  const exists = await prisma.user.findUnique({ where: { phone } });
  if (exists) throw new Error("Bu telefon raqam allaqachon ro'yxatda.");

  await prisma.user.create({
    data: {
      phone,
      fullName,
      passwordHash: hashPassword(password),
      role: "OWNER",
      branchId: null,
    },
  });

  revalidatePath("/specialists");
  await setFlash("{name} qo'shildi.", "ok", { name: fullName });
}

/** Egalik akkauntini o'chirish / qaytarish */
async function toggleOwnerActiveImpl(formData: FormData) {
  const owner = await requireOwner();
  const userId = String(formData.get("userId") ?? "");

  // O'zini o'chirishga yo'l qo'yilmaydi: shu tekshiruv tufayli markaz
  // egasiz qolib ketmaydi — amalni bajarayotgan odamning o'zi faol ega.
  if (userId === owner.id) throw new Error("O'z akkauntingizni o'chira olmaysiz.");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!target || target.role !== "OWNER") throw new Error("Egalik akkaunti topilmadi.");

  await prisma.user.update({ where: { id: userId }, data: { isActive: !target.isActive } });
  revalidatePath("/specialists");
}

/**
 * Egalik akkauntini tahrirlash: ism, telefon (login), parol.
 *
 * Har qanday ega boshqa egani ham, o'zini ham tahrirlay oladi — huquqlari
 * teng. Parol bo'sh qoldirilsa eskisi qoladi. Rol va filial o'zgarmaydi:
 * egani oddiy xodimga aylantirish ataylab yo'q (markaz egasiz qolmasin).
 */
async function updateOwnerImpl(formData: FormData) {
  await requireOwner();
  const userId = String(formData.get("userId") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target || target.role !== "OWNER") throw new Error("Egalik akkaunti topilmadi.");
  if (!fullName || !phone) throw new Error("Ism va telefon majburiy.");
  if (password && password.length < 5) throw new Error("Parol kamida 5 belgidan bo'lsin.");

  const taken = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (taken && taken.id !== userId) throw new Error("Bu telefon raqam allaqachon ro'yxatda.");

  await prisma.user.update({
    where: { id: userId },
    data: { fullName, phone, ...(password ? { passwordHash: hashPassword(password) } : {}) },
  });
  revalidatePath("/specialists");
  revalidatePath("/", "layout");
  await setFlash("{name} saqlandi.", "ok", { name: fullName });
}

/** Qabulxona xodimi uchun akkaunt ochish */
async function createReceptionImpl(formData: FormData) {
  const user = await requireAdmin();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const branchId =
    user.role === "OWNER" ? String(formData.get("branchId") ?? "") : (user.branchId ?? "");

  if (!fullName || !phone || !branchId) throw new Error("Ism, telefon va filial majburiy.");
  if (password.length < 5) throw new Error("Parol kamida 5 belgidan bo'lsin.");

  const exists = await prisma.user.findUnique({ where: { phone } });
  if (exists) throw new Error("Bu telefon raqam allaqachon ro'yxatda.");

  await prisma.user.create({
    data: {
      phone,
      fullName,
      passwordHash: hashPassword(password),
      role: "RECEPTION",
      branchId,
    },
  });

  revalidatePath("/specialists");
  await setFlash("{name} qo'shildi.", "ok", { name: fullName });
}

/** Qabulxona xodimini o'chirish / qaytarish */
async function toggleReceptionActiveImpl(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, branchId: true, isActive: true },
  });
  if (!target || target.role !== "RECEPTION") throw new Error("Xodim topilmadi.");
  if (admin.role === "BRANCH_ADMIN" && target.branchId !== admin.branchId) {
    throw new Error("Bu xodim sizning filialingizda ishlamaydi.");
  }

  await prisma.user.update({ where: { id: userId }, data: { isActive: !target.isActive } });
  revalidatePath("/specialists");
}

/* Tekshiruv xatolari foydalanuvchiga xabar bo'lib ko'rinishi uchun */
export const createSpecialist = withFlash(createSpecialistImpl);
export const updateSpecialist = withFlash(updateSpecialistImpl);
export const updateReception = withFlash(updateReceptionImpl);
export const toggleSpecialistActive = withFlash(toggleSpecialistActiveImpl);
export const paySalary = withFlash(paySalaryImpl);
export const deletePayout = withFlash(deletePayoutImpl);
export const createOwner = withFlash(createOwnerImpl);
export const toggleOwnerActive = withFlash(toggleOwnerActiveImpl);
export const updateOwner = withFlash(updateOwnerImpl);
export const createReception = withFlash(createReceptionImpl);
export const toggleReceptionActive = withFlash(toggleReceptionActiveImpl);
