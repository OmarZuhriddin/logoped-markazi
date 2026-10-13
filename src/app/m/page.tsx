import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isSolo } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  SESSION_STATUSES,
  SPECIALIZATIONS,
  type SessionStatus,
  type Specialization,
  specLabel,
} from "@/lib/constants";
import { addDays, getSpecialistEarnings, monthRange, startOfDay } from "@/lib/stats";
import { dateShort, timeUz } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { setSessionStatus } from "@/app/(app)/schedule/actions";
import { ParentApp } from "./parent";

type Tab = "today" | "week" | "clients" | "money";
const TABS: { key: Tab; label: string }[] = [
  { key: "today", label: "Bugun" },
  { key: "week", label: "Hafta" },
  { key: "clients", label: "Mijozlarim" },
  { key: "money", label: "Pulim" },
];

export default async function MiniAppPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; child?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/tg");
  const t = await getT();

  const { tab: tabRaw, child: childRaw } = await searchParams;
  const tab: Tab = (TABS.find((x) => x.key === tabRaw)?.key ?? "today") as Tab;

  if (user.role === "PARENT") {
    return <ParentApp userId={user.id} tab={tabRaw} childId={childRaw} />;
  }

  /* --- Adminlar uchun: katta jadval veb panelda qulayroq --- */
  if (user.role !== "SPECIALIST") {
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        <div className="app-card p-5 text-center">
          <p className="text-base font-bold">{t("Assalomu alaykum, {name}!", { name: user.fullName })}</p>
          <p className="mt-2 text-sm app-muted">
            {t("Katta jadval va hisobotlar uchun to'liq panel qulayroq.")}
          </p>
          <Link
            href="/"
            className="app-accent mt-4 inline-block rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            {t("Boshqaruv panelini ochish")}
          </Link>
        </div>
      </main>
    );
  }

  /* --- Mutaxassis kabineti --- */
  const specialistId = user.specialistId!;
  const todayFrom = startOfDay();
  const todayTo = addDays(todayFrom, 1);
  const weekTo = addDays(todayFrom, 7);
  const month = monthRange();

  const earnings = await getSpecialistEarnings(specialistId);

  return (
    <main className="mx-auto max-w-md px-4 pb-10 pt-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold">{user.fullName}</p>
          <p className="truncate text-xs app-muted">
            {t(specLabel(user.specialization))}
            {/* Yakka mutaxassisning "filiali" — o'zi uchun ochilgan ichki yozuv,
                uni ekranda ko'rsatishning ma'nosi yo'q */}
            {user.branchName && !isSolo(user) ? ` · ${user.branchName}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs app-muted">{t("Qolgan pulim")}</p>
          <p className="text-base font-bold tabular-nums">{t.money(earnings.balance)}</p>
        </div>
      </header>

      <nav className="mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((x) => (
          <Link
            key={x.key}
            href={`/m?tab=${x.key}`}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium ${
              x.key === tab ? "app-accent" : "app-card app-muted"
            }`}
          >
            {t(x.label)}
          </Link>
        ))}
      </nav>

      {tab === "today" ? (
        <SessionList
          specialistId={specialistId}
          from={todayFrom}
          to={todayTo}
          emptyText={t("Bugunga seans belgilanmagan.")}
          showDate={false}
        />
      ) : null}

      {tab === "week" ? (
        <SessionList
          specialistId={specialistId}
          from={todayFrom}
          to={weekTo}
          emptyText={t("Yaqin 7 kunda seans yo'q.")}
          showDate
        />
      ) : null}

      {tab === "clients" ? <MyClients specialistId={specialistId} /> : null}

      {tab === "money" ? (
        <MyMoney specialistId={specialistId} monthFrom={month.from} monthTo={month.to} />
      ) : null}
    </main>
  );
}

/* ---------------- Seanslar ro'yxati ---------------- */

async function SessionList({
  specialistId,
  from,
  to,
  emptyText,
  showDate,
}: {
  specialistId: string;
  from: Date;
  to: Date;
  emptyText: string;
  showDate: boolean;
}) {
  const sessions = await prisma.session.findMany({
    where: { specialistId, startsAt: { gte: from, lt: to } },
    orderBy: { startsAt: "asc" },
    include: { client: { select: { id: true, fullName: true } } },
  });
  const t = await getT();

  if (sessions.length === 0) {
    return <p className="app-card px-4 py-8 text-center text-sm app-muted">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2">
      {sessions.map((s) => (
        <li key={s.id} className="app-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{s.client.fullName}</p>
              <p className="text-xs app-muted">
                {showDate ? `${t.weekdayShort(s.startsAt)}, ${dateShort(s.startsAt)} · ` : ""}
                {timeUz(s.startsAt)} · {t("{n} daq.", { n: s.durationMin })}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium ${
                s.status === "DONE"
                  ? "bg-emerald-100 text-emerald-700"
                  : s.status === "NO_SHOW"
                    ? "bg-rose-100 text-rose-700"
                    : s.status === "PLANNED"
                      ? "bg-slate-200 text-slate-700"
                      : "bg-amber-100 text-amber-700"
              }`}
            >
              {t(SESSION_STATUSES[s.status as SessionStatus])}
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {s.status === "PLANNED" ? (
              <>
                <MarkButton id={s.id} status="DONE" label={t("O'tdi")} tone="good" />
                <MarkButton id={s.id} status="NO_SHOW" label={t("Kelmadi")} tone="bad" />
                <MarkButton id={s.id} status="CANCELLED_CLIENT" label={t("Bekor")} tone="warn" />
              </>
            ) : (
              <MarkButton id={s.id} status="PLANNED" label={t("Qaytarish")} tone="plain" />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function MarkButton({
  id,
  status,
  label,
  tone,
}: {
  id: string;
  status: SessionStatus;
  label: string;
  tone: "good" | "bad" | "warn" | "plain";
}) {
  const tones = {
    good: "bg-emerald-600 text-white",
    bad: "bg-rose-600 text-white",
    warn: "bg-amber-500 text-white",
    plain: "bg-slate-200 text-slate-700",
  };
  return (
    <form action={setSessionStatus}>
      <input type="hidden" name="sessionId" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tones[tone]}`}
      >
        {label}
      </button>
    </form>
  );
}

/* ---------------- Mijozlarim ---------------- */

async function MyClients({ specialistId }: { specialistId: string }) {
  const t = await getT();
  const assignments = await prisma.assignment.findMany({
    where: { specialistId },
    include: {
      client: {
        select: {
          id: true,
          fullName: true,
          parentPhone: true,
          status: true,
          sessions: {
            where: { specialistId, startsAt: { gte: new Date() }, status: "PLANNED" },
            orderBy: { startsAt: "asc" },
            take: 1,
            select: { startsAt: true },
          },
        },
      },
    },
  });

  if (assignments.length === 0) {
    return <p className="app-card px-4 py-8 text-center text-sm app-muted">{t("Mijoz biriktirilmagan.")}</p>;
  }

  const rows = assignments
    .map((a) => ({
      id: a.client.id,
      name: a.client.fullName,
      phone: a.client.parentPhone,
      status: a.client.status,
      next: a.client.sessions[0]?.startsAt ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ul className="space-y-2">
      {rows.map((c) => (
        <li key={c.id} className="app-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {c.name}
                {c.status !== "ACTIVE" ? (
                  <span className="ml-1.5 text-xs font-normal app-muted">{t("(to'xtatilgan)")}</span>
                ) : null}
              </p>
              <p className="text-xs app-muted">
                {c.next
                  ? `${t("Keyingi:")} ${t.weekdayShort(c.next)}, ${dateShort(c.next)} ${timeUz(c.next)}`
                  : t("Keyingi seans belgilanmagan")}
              </p>
              <a href={`tel:${c.phone}`} className="app-link text-xs">
                {c.phone}
              </a>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Pulim ---------------- */

async function MyMoney({
  specialistId,
  monthFrom,
  monthTo,
}: {
  specialistId: string;
  monthFrom: Date;
  monthTo: Date;
}) {
  const [earnings, sessions, payouts, specialist] = await Promise.all([
    getSpecialistEarnings(specialistId),
    prisma.session.findMany({
      where: {
        specialistId,
        startsAt: { gte: monthFrom, lt: monthTo },
        status: { in: ["DONE", "NO_SHOW"] },
      },
      orderBy: { startsAt: "desc" },
      include: { client: { select: { fullName: true } } },
    }),
    prisma.salaryPayout.findMany({
      where: { specialistId },
      orderBy: { paidAt: "desc" },
      take: 10,
    }),
    prisma.specialist.findUnique({
      where: { id: specialistId },
      select: { salaryPercent: true },
    }),
  ]);

  const percent = specialist?.salaryPercent ?? 0;
  const t = await getT();
  const money = t.money;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Stat label={t("Qolgan (olishim kerak)")} value={money(earnings.balance)} strong />
        <Stat label={t("{month}da hisoblangan", { month: t.monthYear(monthFrom) })} value={money(earnings.accruedMonth)} />
        <Stat label={t("Jami hisoblangan")} value={money(earnings.accruedTotal)} />
        <Stat label={t("Jami to'langan")} value={money(earnings.paidTotal)} />
      </div>

      <section className="app-card p-3">
        <p className="mb-2 text-sm font-semibold">
          {t("{month} seanslari", { month: t.monthYear(monthFrom) })}{" "}
          <span className="font-normal app-muted">· {t("ulushim {pct}%", { pct: percent })}</span>
        </p>
        {sessions.length === 0 ? (
          <p className="py-4 text-center text-sm app-muted">{t("Bu oyda hisobga kirgan seans yo'q.")}</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {sessions.map((s) => {
              // Foiz seans bilan birga saqlanadi: keyin ulush o'zgarsa ham
              // o'tib bo'lgan seansning hisobi o'zgarmaydi. Mutaxassis
              // raqam qayerdan chiqqanini ko'rib tursin.
              const pct = s.salaryPercent ?? percent;
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{s.client.fullName}</p>
                    <p className="text-xs app-muted">
                      {dateShort(s.startsAt)} · {t(SESSION_STATUSES[s.status as SessionStatus])}
                    </p>
                    {s.price > 0 ? (
                      <p className="text-xs app-muted tabular-nums">
                        {money(s.price)} × {pct}%
                      </p>
                    ) : (
                      // Narx xizmatdan olinadi: xizmatsiz eski seansda 0 bo'lib
                      // qoladi va ulush ham 0 chiqadi. Jim turmasin.
                      <p className="text-xs font-medium text-amber-600">
                        {t("narx belgilanmagan")}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {money(Math.round((s.price * pct) / 100))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="app-card p-3">
        <p className="mb-2 text-sm font-semibold">{t("Qo'lga tekkan to'lovlar")}</p>
        {payouts.length === 0 ? (
          <p className="py-4 text-center text-sm app-muted">{t("Hali to'lov yozilmagan.")}</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm tabular-nums">{dateShort(p.paidAt)}</p>
                  {p.note ? <p className="truncate text-xs app-muted">{p.note}</p> : null}
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {money(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="app-card p-3">
      <p className="text-xs app-muted">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? "text-lg font-bold" : "text-base font-semibold"}`}>
        {value}
      </p>
    </div>
  );
}
