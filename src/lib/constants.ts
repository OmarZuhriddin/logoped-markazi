/** Rollar va ularning o'zbekcha nomlari */
export const ROLES = {
  OWNER: "Markaz egasi",
  BRANCH_ADMIN: "Filial admini",
  RECEPTION: "Qabulxona xodimi",
  SPECIALIST: "Mutaxassis",
  PARENT: "Ota-ona",
} as const;

export type Role = keyof typeof ROLES;
export const ROLE_KEYS = Object.keys(ROLES) as Role[];

/** Mutaxassislik turlari */
export const SPECIALIZATIONS = {
  ABA: "ABA terapevt",
  LOGOPED: "Logoped-defektolog",
  AFK: "AFK (adaptiv jismoniy tarbiya)",
  MASSAGE: "Massajchi",
  PSYCHOLOGIST: "Psixolog",
  SENSORY: "Sensor integratsiya",
} as const;

export type Specialization = keyof typeof SPECIALIZATIONS;
export const SPECIALIZATION_KEYS = Object.keys(SPECIALIZATIONS) as Specialization[];

/**
 * Mutaxassislikni ko'rsatiladigan nomga aylantiradi. Xodim qo'shganda
 * mutaxassislik erkin yoziladi, shuning uchun bazada kalit ("ABA") ham,
 * qo'lda yozilgan nom ("Neyropsixolog") ham turishi mumkin: ro'yxatda
 * bo'lmaganini o'zi qaytaradi.
 */
export function specLabel(value: string | null | undefined): string {
  if (!value) return "";
  return (SPECIALIZATIONS as Record<string, string>)[value] ?? value;
}

/**
 * Yozilgan mutaxassislikni saqlash shakliga keltiradi: ro'yxatdagi nom yoki
 * kalitga to'g'ri kelsa kalit ("aba terapevt" -> "ABA") — shunda hisobotlarda
 * bir xil mutaxassislik ikkiga bo'linib qolmaydi; boshqasi yozilgani bo'yicha.
 */
export function normalizeSpecialization(raw: string): string {
  const v = raw.trim().replace(/\s+/g, " ");
  const hit = SPECIALIZATION_KEYS.find(
    (k) => k.toLowerCase() === v.toLowerCase() || SPECIALIZATIONS[k].toLowerCase() === v.toLowerCase(),
  );
  return hit ?? v;
}

/** Seans holatlari */
export const SESSION_STATUSES = {
  PLANNED: "Rejada",
  DONE: "O'tdi",
  NO_SHOW: "Kelmadi (sababsiz)",
  CANCELLED_CLIENT: "Mijoz bekor qildi",
  CANCELLED_CENTER: "Markaz bekor qildi",
} as const;

export type SessionStatus = keyof typeof SESSION_STATUSES;
export const SESSION_STATUS_KEYS = Object.keys(SESSION_STATUSES) as SessionStatus[];

/** Seans holatining rangi (Tailwind klasslari) */
export const SESSION_STATUS_STYLE: Record<SessionStatus, string> = {
  PLANNED: "bg-slate-100 text-slate-700 ring-slate-200",
  DONE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  NO_SHOW: "bg-rose-50 text-rose-700 ring-rose-200",
  CANCELLED_CLIENT: "bg-amber-50 text-amber-700 ring-amber-200",
  CANCELLED_CENTER: "bg-sky-50 text-sky-700 ring-sky-200",
};

/** Mijoz holati */
export const CLIENT_STATUSES = {
  ACTIVE: "Faol",
  PAUSED: "To'xtatilgan",
  ARCHIVED: "Arxivda",
} as const;

export type ClientStatus = keyof typeof CLIENT_STATUSES;
export const CLIENT_STATUS_KEYS = Object.keys(CLIENT_STATUSES) as ClientStatus[];

/**
 * Mijoz pulni qanday to'laydi.
 *
 * Markazga kelganlarning ko'pi abonement olmaydi — har kelganida to'laydi.
 * Shuning uchun standarti DAILY: unday mijozda "qolgan seans" ham, "qarz" ham
 * bo'lmaydi, seans narxi Sozlamalardagi standart narxdan olinadi.
 */
export const BILLING_TYPES = {
  DAILY: "Kunlik to'lov",
  PACKAGE: "Abonement",
} as const;

export type BillingType = keyof typeof BILLING_TYPES;
export const BILLING_TYPE_KEYS = Object.keys(BILLING_TYPES) as BillingType[];

/** To'lov usullari */
export const PAYMENT_METHODS = {
  CASH: "Naqd",
  CARD: "Karta",
  TRANSFER: "O'tkazma",
} as const;

export type PaymentMethod = keyof typeof PAYMENT_METHODS;
export const PAYMENT_METHOD_KEYS = Object.keys(PAYMENT_METHODS) as PaymentMethod[];

/**
 * Ota-ona mashg'ulotni Mini App'dan necha soat oldin bekor qila oladi.
 * Undan kechroq bo'lsa mutaxassis vaqtini boshqaga bera olmaydi — o'shanda
 * ota-ona markazga qo'ng'iroq qiladi va kelmadi/bekor qarorini xodim qiladi.
 */
export const PARENT_CANCEL_MIN_HOURS = 2;

/** Hisob-kitobda "o'tgan" deb sanaladigan holatlar (mutaxassis haqi shulardan) */
export const BILLABLE_STATUSES: SessionStatus[] = ["DONE", "NO_SHOW"];

/** Qabul (konsultatsiya) holati */
export const INTAKE_STATUSES = {
  PLANNED: "Rejada",
  DONE: "Bo'lib o'tdi",
  NO_SHOW: "Kelmadi",
  CANCELLED: "Bekor qilindi",
} as const;

export type IntakeStatus = keyof typeof INTAKE_STATUSES;
export const INTAKE_STATUS_KEYS = Object.keys(INTAKE_STATUSES) as IntakeStatus[];

export const INTAKE_STATUS_STYLE: Record<IntakeStatus, string> = {
  PLANNED: "bg-slate-100 text-slate-700 ring-slate-200",
  DONE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  NO_SHOW: "bg-rose-50 text-rose-700 ring-rose-200",
  CANCELLED: "bg-amber-50 text-amber-700 ring-amber-200",
};

/** Qabul natijasi: konsultatsiyadan keyin nima bo'ldi */
export const INTAKE_RESULTS = {
  PENDING: "Hali aniq emas",
  CONVERTED: "Mijoz bo'ldi",
  THINKING: "O'ylab ko'radi",
  REFUSED: "Rad etdi",
} as const;

export type IntakeResult = keyof typeof INTAKE_RESULTS;
export const INTAKE_RESULT_KEYS = Object.keys(INTAKE_RESULTS) as IntakeResult[];

export const INTAKE_RESULT_STYLE: Record<IntakeResult, string> = {
  PENDING: "bg-slate-100 text-slate-600 ring-slate-200",
  CONVERTED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  THINKING: "bg-amber-50 text-amber-700 ring-amber-200",
  REFUSED: "bg-rose-50 text-rose-700 ring-rose-200",
};
