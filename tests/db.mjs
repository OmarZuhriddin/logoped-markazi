/**
 * Testlar uchun bazaga to'g'ridan-to'g'ri kichik ulanish.
 *
 * Ilovada nima bo'layotganini brauzerdan emas, bazadan tekshirish uchun kerak:
 * "tugma bosildi" emas, "yozuv haqiqatan paydo bo'ldi" degan javob olinadi.
 *
 * Ikki qulaylik:
 *  - Prisma jadval va ustun nomlarini katta-kichik harf bilan yaratadi
 *    ("User", "fullName"), PostgreSQL esa tirnoqsiz nomlarni kichik harfga
 *    tushiradi — shuning uchun ular avtomatik tirnoqqa olinadi;
 *  - parametrlar SQLite uslubidagi "?" bilan yozilaveradi, bu yerda ular
 *    PostgreSQL uslubidagi $1, $2 ga aylantiriladi.
 */
import "dotenv/config";
import pg from "pg";

/**
 * Prisma `DateTime` ni PostgreSQL'da "timestamp without time zone" qilib
 * saqlaydi va uni doim UTC deb o'qiydi. `pg` esa zonasiz vaqtni jarayonning
 * o'z zonasi deb tushunadi — server Toshkent vaqtida ishlagani uchun bu yerda
 * 5 soatlik farq chiqib qolardi va tekshiruvlar ilovani bekorga ayblardi.
 * Shuning uchun biz ham UTC deb o'qiymiz.
 */
pg.types.setTypeParser(1114, (value) => new Date(`${value.replace(" ", "T")}Z`));

const IDENTIFIERS = [
  // jadvallar
  "SalaryPayout", "ClientService", "SessionType", "Notification", "Assignment", "Specialist", "Payment", "ClickTransaction",
  "Package", "Session", "Client", "Branch", "User", "LinkCode", "Intake", "Settings",
  // ustunlar va taxalluslar
  "telegramUsername", "pricePerSession", "parentUserId", "totalSessions",
  "specialistId", "salaryPercent", "telegramId", "purchasedAt", "parentPhone",
  "clientName", "dedupeKey", "sessionId", "childName", "packageId", "birthDate",
  "createdAt", "startsAt", "clientId", "branchId", "fullName", "isActive",
  "scheduledAt", "createdById", "childName", "parentName", "billingType",
  "defaultSalaryPercent", "workStartHour", "workEndHour", "slotMinutes",
  "defaultPrice", "workDays", "centerName", "timezoneShiftedAt", "soloInviteCode", "isSolo", "logoMime", "logoData", "logoUpdatedAt",
  "userId", "paidAt", "sentAt", "durationMin", "sessionTypeId", "brandName",
  "clickTransId", "paymentId", "updatedAt", "lunchStartMin", "lunchEndMin", "sheetsUrl", "sheetsSyncedAt", "sheetsError", "sheetsDirtyAt", "sheetsLockAt",
].sort((a, b) => b.length - a.length);

const IDENT_RE = new RegExp(`\\b(${IDENTIFIERS.join("|")})\\b`, "g");

const quoteIdentifiers = (sql) => sql.replace(IDENT_RE, '"$1"');

const toPgPlaceholders = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL sozlanmagan — .env faylini tekshiring.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 3 });

export async function all(sql, ...params) {
  const result = await pool.query(toPgPlaceholders(quoteIdentifiers(sql)), params);
  return result.rows;
}

export async function one(sql, ...params) {
  const rows = await all(sql, ...params);
  return rows[0] ?? null;
}

/** "SELECT COUNT(*) AS n ..." ko'rinishidagi so'rov uchun */
export async function count(sql, ...params) {
  const row = await one(sql, ...params);
  return Number(row?.n ?? 0);
}

export async function closeDb() {
  await pool.end().catch(() => {});
}
