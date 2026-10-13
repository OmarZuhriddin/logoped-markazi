import { getSessionTypes } from "@/lib/session-types";
import { TableTools } from "@/components/table-tools";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole, NOT_SOLO, branchWhere, isSolo } from "@/lib/auth";
import { SPECIALIZATIONS, type Specialization, specLabel } from "@/lib/constants";
import { daySlots, getWorkHours, isWorkDay, minutesToTime } from "@/lib/settings";
import { addDays, startOfDay } from "@/lib/stats";
import { dateShort, timeUz } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { Card, Empty, PageHeader, btn, btnPrimary, card, input, label } from "@/components/ui";
import { createSession } from "@/app/(app)/schedule/actions";

type Search = { w?: string; sp?: string; d?: string; b?: string };

/** Haftaning dushanbasi */
function mondayOf(date: Date): Date {
  const x = startOfDay(date);
  const shift = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - shift);
  return x;
}

export default async function SlotsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireRole("OWNER", "BRANCH_ADMIN", "RECEPTION");
  const sp = await searchParams;
  // Yakka logoped o'z ish vaqti bo'yicha ishlaydi, markaz — umumiy ish vaqti bo'yicha
  const settings = await getWorkHours(isSolo(user) ? user.branchId : null);
  const t = await getT();

  const weekOffset = Number.parseInt(sp.w ?? "0", 10) || 0;
  const from = addDays(mondayOf(new Date()), weekOffset * 7);
  const to = addDays(from, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));

  const branchId = user.role === "OWNER" ? (sp.b || null) : user.branchId;

  const [specialists, sessions, branches, sessionTypes] = await Promise.all([
    prisma.specialist.findMany({
      where: { isActive: true, ...branchWhere(branchId) },
      include: { user: { select: { fullName: true } }, branch: { select: { name: true } } },
      orderBy: [{ branch: { name: "asc" } }, { user: { fullName: "asc" } }],
    }),
    prisma.session.findMany({
      where: {
        startsAt: { gte: from, lt: to },
        status: { in: ["PLANNED", "DONE"] },
        ...branchWhere(branchId),
      },
      select: { specialistId: true, startsAt: true, durationMin: true },
    }),
    user.role === "OWNER"
      ? prisma.branch.findMany({ where: NOT_SOLO, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    getSessionTypes(user),
  ]);

  /**
   * Band vaqtlar: mutaxassis + kun bo'yicha.
   *
   * Seans oralig'i bo'sh vaqt oralig'iga to'g'ri kelmasligi mumkin (45 daqiqalik
   * seans 60 daqiqalik oraliqda), shuning uchun kesishish bo'yicha tekshiriladi.
   */
  const busy = new Map<string, { start: number; end: number }[]>();
  for (const s of sessions) {
    const list = busy.get(s.specialistId) ?? [];
    list.push({
      start: s.startsAt.getTime(),
      end: s.startsAt.getTime() + s.durationMin * 60_000,
    });
    busy.set(s.specialistId, list);
  }

  const freeSlots = (specialistId: string, day: Date): Date[] => {
    const taken = busy.get(specialistId) ?? [];
    const length = settings.slotMinutes * 60_000;
    const now = Date.now();
    return daySlots(day, settings).filter((slot) => {
      const start = slot.getTime();
      if (start < now) return false; // o'tgan vaqtni taklif qilishning ma'nisi yo'q
      return !taken.some((t) => t.start < start + length && t.end > start);
    });
  };

  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (weekOffset !== 0) p.set("w", String(weekOffset));
    if (sp.b) p.set("b", sp.b);
    if (sp.sp) p.set("sp", sp.sp);
    if (sp.d) p.set("d", sp.d);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const q = p.toString();
    return q ? `/slots?${q}` : "/slots";
  };

  // Tanlangan katak: mutaxassis + kun
  const picked =
    sp.sp && sp.d
      ? {
          specialist: specialists.find((x) => x.id === sp.sp) ?? null,
          day: startOfDay(new Date(sp.d)),
        }
      : null;

  const pickedSlots =
    picked?.specialist && !Number.isNaN(picked.day.getTime())
      ? freeSlots(picked.specialist.id, picked.day)
      : [];

  const clients =
    picked?.specialist
      ? await prisma.client.findMany({
          where: { status: "ACTIVE", branchId: picked.specialist.branchId },
          select: { id: true, fullName: true },
          orderBy: { fullName: "asc" },
        })
      : [];

  return (
    <>
      <PageHeader
        title={t("Bo'sh vaqtlar")}
        subtitle={`${dateShort(from)} — ${dateShort(addDays(from, 6))} · ${t("ish vaqti")} ${
          settings.workStartHour
        }:00–${settings.workEndHour}:00${
          settings.lunchStartMin != null && settings.lunchEndMin != null
            ? ` · ${t("tushlik")} ${minutesToTime(settings.lunchStartMin)}–${minutesToTime(settings.lunchEndMin)}`
            : ""
        }`}
        action={
          <div className="flex gap-2">
            <Link href={qs({ w: String(weekOffset - 1), sp: null, d: null })} className={btn}>
              ← {t("O'tgan hafta")}
            </Link>
            {weekOffset !== 0 ? (
              <Link href={qs({ w: "0", sp: null, d: null })} className={btn}>
                {t("Shu hafta")}
              </Link>
            ) : null}
            <Link href={qs({ w: String(weekOffset + 1), sp: null, d: null })} className={btn}>
              {t("Keyingi hafta")} →
            </Link>
          </div>
        }
      />

      {branches.length > 0 ? (
        <form method="get" className={`${card} mb-5 flex flex-wrap items-end gap-3 p-4`}>
          {weekOffset !== 0 ? <input type="hidden" name="w" value={weekOffset} /> : null}
          <div className="min-w-[200px]">
            <label className={label} htmlFor="b">
              {t("Filial")}
            </label>
            <select id="b" name="b" defaultValue={sp.b ?? ""} className={input}>
              <option value="">{t("Barcha filiallar")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={btnPrimary}>
            {t("Ko'rsatish")}
          </button>
        </form>
      ) : null}

      <Card>
        {specialists.length === 0 ? (
          <Empty>{t("Mutaxassis yo'q. Avval Xodimlar bo'limidan qo'shing.")}</Empty>
        ) : (
          <TableTools>
            <table className="w-full min-w-[880px]">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("Mutaxassis")}
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.toISOString()}
                      className={`px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide ${
                        isWorkDay(d, settings.workDays)
                          ? "text-slate-500 dark:text-slate-400"
                          : "text-slate-300 dark:text-slate-600"
                      }`}
                    >
                      {t.weekdayShort(d)}
                      <span className="block font-normal normal-case">{dateShort(d)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {specialists.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {s.user.fullName}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {t(specLabel(s.specialization))}
                        {branchId ? "" : ` · ${s.branch.name}`}
                      </span>
                    </td>
                    {days.map((d) => {
                      const free = freeSlots(s.id, d).length;
                      const isPicked = picked?.specialist?.id === s.id && sp.d === isoDay(d);
                      return (
                        <td key={d.toISOString()} className="px-2 py-2.5 text-center">
                          {free === 0 ? (
                            <span className="text-sm text-slate-300 dark:text-slate-600">—</span>
                          ) : (
                            <Link
                              href={qs({ sp: s.id, d: isoDay(d) })}
                              className={`inline-flex min-w-[36px] items-center justify-center rounded-full px-2.5 py-1 text-sm font-semibold transition ${
                                isPicked
                                  ? "bg-indigo-600 text-white"
                                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300"
                              }`}
                            >
                              {free}
                            </Link>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableTools>
        )}
        <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {t("Raqam — o'sha kundagi bo'sh vaqtlar soni. Raqamni bosib vaqtni tanlang. O'tib ketgan vaqtlar sanalmaydi.")}
        </p>
      </Card>

      {picked?.specialist ? (
        <Card
          title={`${picked.specialist.user.fullName} · ${dateShort(picked.day)}`}
          subtitle={t("{n} ta bo'sh vaqt", { n: pickedSlots.length })}
          className="mt-5"
          action={
            <Link href={qs({ sp: null, d: null })} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              {t("Yopish")}
            </Link>
          }
        >
          {pickedSlots.length === 0 ? (
            <Empty>{t("Bu kunda bo'sh vaqt qolmagan.")}</Empty>
          ) : clients.length === 0 ? (
            <Empty>{t("Bu filialda faol mijoz yo'q.")}</Empty>
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {pickedSlots.map((slot) => (
                <form
                  key={slot.toISOString()}
                  action={createSession}
                  className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                >
                  <input type="hidden" name="specialistId" value={picked.specialist!.id} />
                  <input type="hidden" name="startsAt" value={localInput(slot)} />
                  <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {timeUz(slot)}
                  </p>
                  <select name="clientId" className={input} required defaultValue="">
                    <option value="" disabled>
                      {t("Mijozni tanlang")}
                    </option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName}
                      </option>
                    ))}
                  </select>
                  {sessionTypes.length > 0 ? (
                    <select
                      name="sessionTypeId"
                      defaultValue=""
                      aria-label={t("Xizmat")}
                      className={`${input} mt-2`}
                    >
                      <option value="">{t("— mijozning xizmati —")}</option>
                      {sessionTypes.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name} · {t.money(st.price)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      name="durationMin"
                      type="number"
                      min={15}
                      max={240}
                      step={5}
                      defaultValue={45}
                      aria-label={t("Davomiyligi (daqiqa)")}
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
                    />
                    <button type="submit" className={`${btnPrimary} flex-1`}>
                      {t("Yozish")}
                    </button>
                  </div>
                </form>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </>
  );
}

/** Manzilga yoziladigan kun: 2026-10-07 */
function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** datetime-local uchun qiymat (mahalliy vaqt, UTC emas) */
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
