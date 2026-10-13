const MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];

const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const WEEKDAYS_SHORT = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];

/** 1 250 000 so'm */
export function money(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(amount))} so'm`;
}

/** 1 250 000 (so'm so'zisiz) */
export function num(amount: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(amount));
}

/** 14 mart 2026 */
export function dateUz(d: Date | string): string {
  const x = new Date(d);
  return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}

/** 14.03.2026 */
export function dateShort(d: Date | string): string {
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(x.getDate())}.${p(x.getMonth() + 1)}.${x.getFullYear()}`;
}

/** 09:30 */
export function timeUz(d: Date | string): string {
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(x.getHours())}:${p(x.getMinutes())}`;
}

/** 14.03.2026, 09:30 */
export function dateTimeUz(d: Date | string): string {
  return `${dateShort(d)}, ${timeUz(d)}`;
}

export function weekdayUz(d: Date | string): string {
  return WEEKDAYS[new Date(d).getDay()];
}

export function weekdayShortUz(d: Date | string): string {
  return WEEKDAYS_SHORT[new Date(d).getDay()];
}

/** mart 2026 */
export function monthYearUz(d: Date | string): string {
  const x = new Date(d);
  return `${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}

/** Yoshi: "4 yosh 3 oy" */
export function ageUz(birth: Date | string, now: Date = new Date()): string {
  const b = new Date(birth);
  let years = now.getFullYear() - b.getFullYear();
  let months = now.getMonth() - b.getMonth();
  if (now.getDate() < b.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0) return `${Math.max(months, 0)} oy`;
  return months > 0 ? `${years} yosh ${months} oy` : `${years} yosh`;
}

/** <input type="date"> uchun 2026-03-14 */
export function toDateInput(d: Date | string): string {
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

/**
 * Sana maydonidan kelgan matnni Date ga aylantiradi: "05.05.2020" (kun.oy.yil),
 * "05.05.2020 09:30" yoki ISO ("2020-05-05", "2020-05-05T09:30"). Noto'g'ri
 * sana (31.02.2020 ham) NaN beradi.
 *
 * Vaqtsiz sana UTC yarim tunida olinadi (sana-kunlik maydonlar shunday
 * saqlanadi), vaqtli matn esa markaz vaqti (jarayon zonasi) deb tushuniladi.
 */
export function parseDateInput(raw: string): Date {
  const s = raw.trim();
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?: (\d{1,2}):(\d{2}))?$/.exec(s);
  if (!m) return new Date(s);
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (m[4] === undefined) {
    const date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCDate() === d && date.getUTCMonth() === mo - 1 ? date : new Date(NaN);
  }
  const [h, min] = [Number(m[4]), Number(m[5])];
  const date = new Date(y, mo - 1, d, h, min);
  const ok = date.getDate() === d && date.getMonth() === mo - 1 && h < 24 && min < 60;
  return ok ? date : new Date(NaN);
}

/** <input type="datetime-local"> uchun 2026-03-14T09:30 */
export function toDateTimeInput(d: Date | string): string {
  return `${toDateInput(d)}T${timeUz(d)}`;
}
