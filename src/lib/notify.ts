import "server-only";
import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/telegram";
import { SPECIALIZATIONS, type Specialization, specLabel } from "@/lib/constants";
import { dateShort, timeUz, weekdayUz } from "@/lib/format";
import { addDays, startOfDay } from "@/lib/stats";

/**
 * Ota-onalarga Telegram orqali yuboriladigan eslatmalar.
 *
 * Ikki qadamli ishlaydi:
 *   1) navbatga qo'yish — kerakli xabarlar Notification jadvaliga yoziladi
 *      (dedupeKey bir xil xabarning ikki marta ketishiga yo'l qo'ymaydi);
 *   2) yuborish — navbatdagi xabarlar Telegram'ga jo'natiladi, muvaffaqiyatsizi
 *      keyingi urinishda qayta sinaladi (3 martagacha).
 */

const MAX_ATTEMPTS = 3;

type Candidate = {
  userId: string;
  clientId: string;
  kind: string;
  dedupeKey: string;
  text: string;
};

/** Faqat hali yo'q xabarlarni yozadi */
async function queue(candidates: Candidate[]): Promise<number> {
  if (candidates.length === 0) return 0;

  const existing = await prisma.notification.findMany({
    where: { dedupeKey: { in: candidates.map((c) => c.dedupeKey) } },
    select: { dedupeKey: true },
  });
  const seen = new Set(existing.map((e) => e.dedupeKey));
  const fresh = candidates.filter((c) => !seen.has(c.dedupeKey));
  if (fresh.length === 0) return 0;

  const result = await prisma.notification.createMany({ data: fresh });
  return result.count;
}

/** Yil-hafta kaliti: "2026-W40" */
function weekKey(d: Date): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((x.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${x.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/* ---------------- 1. Ertangi mashg'ulot eslatmasi ---------------- */

export async function queueTomorrowReminders(now: Date = new Date()): Promise<number> {
  const from = addDays(startOfDay(now), 1);
  const to = addDays(from, 1);

  const sessions = await prisma.session.findMany({
    where: {
      status: "PLANNED",
      startsAt: { gte: from, lt: to },
      client: { status: "ACTIVE", parent: { telegramId: { not: null }, isActive: true } },
    },
    include: {
      client: { select: { id: true, fullName: true, parentUserId: true } },
      specialist: { include: { user: { select: { fullName: true } } } },
      branch: { select: { name: true } },
    },
  });

  return queue(
    sessions.flatMap((s) => {
      if (!s.client.parentUserId) return [];
      const spec = specLabel(s.specialist.specialization);
      return [
        {
          userId: s.client.parentUserId,
          clientId: s.client.id,
          kind: "SESSION_REMINDER",
          dedupeKey: `SESSION_REMINDER:${s.id}`,
          text:
            `🔔 <b>Eslatma</b>\n\n` +
            `Ertaga (${weekdayUz(s.startsAt).toLowerCase()}, ${dateShort(s.startsAt)}) ` +
            `soat <b>${timeUz(s.startsAt)}</b> da <b>${s.client.fullName}</b> uchun ` +
            `${spec} mashg'uloti bor.\n` +
            `Mutaxassis: ${s.specialist.user.fullName}\n` +
            `Manzil: ${s.branch.name}`,
        },
      ];
    }),
  );
}

/*
 * Abonement tugashi va qarzdorlik eslatmalari olib tashlangan: markazda
 * abonement yo'q, har seans kelganda to'lanadi. Bazadagi eski PACKAGE_LOW /
 * DEBT yozuvlari tarix sifatida qoladi.
 */

/* ---------------- 2. Mashg'ulot o'tdi (seans belgilangan zahoti) ---------------- */

export async function queueSessionDone(sessionId: string): Promise<number> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      client: { select: { id: true, fullName: true, parentUserId: true, status: true } },
      specialist: { include: { user: { select: { fullName: true } } } },
    },
  });

  if (!session || session.status !== "DONE") return 0;
  if (!session.client.parentUserId) return 0;

  const parent = await prisma.user.findUnique({
    where: { id: session.client.parentUserId },
    select: { telegramId: true, isActive: true },
  });
  if (!parent?.telegramId || !parent.isActive) return 0;

  const spec = specLabel(session.specialist.specialization);

  return queue([
    {
      userId: session.client.parentUserId,
      clientId: session.client.id,
      kind: "SESSION_DONE",
      dedupeKey: `SESSION_DONE:${session.id}`,
      text:
        `✅ <b>Mashg'ulot o'tdi</b>\n\n` +
        `<b>${session.client.fullName}</b> · ${spec}\n` +
        `Mutaxassis: ${session.specialist.user.fullName}\n` +
        `Vaqt: ${dateShort(session.startsAt)} ${timeUz(session.startsAt)}`,
    },
  ]);
}

/**
 * Odam yozgan matn Telegram'ga HTML bo'lib ketadi: "<" yoki "&" bo'lsa
 * Telegram butun xabarni rad etadi, teg bo'lsa esa uni bajarib yuboradi.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------------- 3. Ota-ona mashg'ulotni bekor qildi ---------------- */

/**
 * Xabar mutaxassisning o'ziga va shu filial xodimlariga (qabulxona, admin)
 * boradi — vaqt bo'shadi, uni boshqa bolaga berish mumkin. Ega ham oladi,
 * lekin yakka mutaxassisning filialida ega yo'q: u markazga tegishli emas.
 */
export async function queueParentCancel(sessionId: string, reason: string): Promise<number> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      client: { select: { id: true, fullName: true } },
      specialist: { select: { userId: true, specialization: true } },
      branch: { select: { id: true, isSolo: true } },
    },
  });
  if (!session) return 0;

  const staff = await prisma.user.findMany({
    where: {
      isActive: true,
      telegramId: { not: null },
      OR: [
        { id: session.specialist.userId },
        ...(session.branch.isSolo
          ? []
          : [
              { branchId: session.branch.id, role: { in: ["RECEPTION", "BRANCH_ADMIN"] } },
              { role: "OWNER" },
            ]),
      ],
    },
    select: { id: true },
  });

  const spec = specLabel(session.specialist.specialization);
  const text =
    `❌ <b>Ota-ona mashg'ulotni bekor qildi</b>\n\n` +
    `<b>${session.client.fullName}</b> · ${spec}\n` +
    `Vaqt: ${weekdayUz(session.startsAt)}, ${dateShort(session.startsAt)} ${timeUz(session.startsAt)}` +
    (reason ? `\nSababi: ${escapeHtml(reason)}` : "") +
    `\n\nBu vaqt endi bo'sh.`;

  return queue(
    staff.map((u) => ({
      userId: u.id,
      clientId: session.client.id,
      kind: "PARENT_CANCEL",
      dedupeKey: `PARENT_CANCEL:${session.id}:${u.id}`,
      text,
    })),
  );
}

/* ---------------- Navbatdagilarni yuborish ---------------- */

export async function sendPending(limit = 50): Promise<{ sent: number; failed: number }> {
  const pending = await prisma.notification.findMany({
    where: { sentAt: null, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { user: { select: { telegramId: true, isActive: true } } },
  });

  let sent = 0;
  let failed = 0;

  for (const n of pending) {
    if (!n.user.telegramId || !n.user.isActive) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { attempts: MAX_ATTEMPTS, error: "Telegram akkaunti bog'lanmagan" },
      });
      failed++;
      continue;
    }

    const ok = await sendMessage(n.user.telegramId, n.text);
    if (ok) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { sentAt: new Date(), error: null, attempts: { increment: 1 } },
      });
      sent++;
    } else {
      await prisma.notification.update({
        where: { id: n.id },
        data: { attempts: { increment: 1 }, error: "Telegram'ga yuborilmadi" },
      });
      failed++;
    }
  }

  return { sent, failed };
}

/** Cron chaqiradigan to'liq sikl */
export async function runNotifications(now: Date = new Date()) {
  const reminders = await queueTomorrowReminders(now);
  const { sent, failed } = await sendPending();

  return { queued: { reminders }, sent, failed };
}
