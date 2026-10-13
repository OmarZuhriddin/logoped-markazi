import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  BILLABLE_STATUSES,
  PARENT_CANCEL_MIN_HOURS,
  PAYMENT_METHODS,
  SESSION_STATUSES,
  SPECIALIZATIONS,
  type PaymentMethod,
  type SessionStatus,
  type Specialization,
  specLabel,
} from "@/lib/constants";
import { cancelByParent } from "./parent-actions";
import { TgLink } from "./tg-link";
import { ClickPay } from "./click-pay";
import { clickEnabled } from "@/lib/click";
import { ParentTabNav, ParentTabs, TabPanel } from "./parent-tabs";
import { dateShort, timeUz } from "@/lib/format";
import { getT } from "@/lib/i18n/server";

type ParentTab = "child" | "schedule" | "history" | "payments" | "team";

// "Farzandim" birinchi: kabinet ochilganda bola haqida umumiy manzara turadi
const TABS: { key: ParentTab; label: string }[] = [
  { key: "child", label: "Farzandim" },
  { key: "schedule", label: "Jadval" },
  { key: "history", label: "Davomat" },
  { key: "payments", label: "To'lovlar" },
  { key: "team", label: "Mutaxassislar" },
];

export async function ParentApp({
  userId,
  tab: tabRaw,
  childId: childRaw,
}: {
  userId: string;
  tab?: string;
  childId?: string;
}) {
  const t = await getT();
  const money = t.money;
  const tab: ParentTab = (TABS.find((x) => x.key === tabRaw)?.key ?? "child") as ParentTab;

  const now = new Date();
  const mine = { client: { parentUserId: userId } };
  const withSpecialist = {
    specialist: {
      select: { specialization: true, user: { select: { fullName: true } } },
    },
  } as const;

  // Hamma narsa bitta to'lqinda va hamma farzand uchun birdaniga olinadi:
  // baza uzoqda, har bir ketma-ket so'rov kabinetni sekinlashtiradi.
  // Farzand tanlangach qolgani xotirada ajratiladi (bolalar 1-2 ta bo'ladi).
  const [children, upcomingAll, historyAll, paymentsAll, teamAll, doneAll, paidAll, earnedAll] =
    await Promise.all([
      prisma.client.findMany({
        where: { parentUserId: userId },
        orderBy: { fullName: "asc" },
        include: {
          branch: { select: { name: true, address: true, phone: true, isSolo: true, brandName: true } },
        },
      }),
      prisma.session.findMany({
        where: { ...mine, startsAt: { gte: now }, status: "PLANNED" },
        orderBy: { startsAt: "asc" },
        take: 60,
        include: withSpecialist,
      }),
      prisma.session.findMany({
        where: { ...mine, startsAt: { lt: now } },
        orderBy: { startsAt: "desc" },
        take: 60,
        include: withSpecialist,
      }),
      prisma.payment.findMany({
        where: mine,
        orderBy: { paidAt: "desc" },
        take: 150,
      }),
      prisma.assignment.findMany({
        where: { ...mine, specialist: { isActive: true } },
        orderBy: { createdAt: "asc" },
        include: {
          specialist: {
            include: {
              user: { select: { fullName: true, phone: true, telegramUsername: true } },
            },
          },
        },
      }),
      prisma.session.groupBy({
        by: ["clientId"],
        where: { ...mine, status: "DONE" },
        _count: { _all: true },
      }),
      // Hisob-kitob: ro'yxat 150 ta to'lov bilan cheklangan, jami esa aniq bo'lsin
      prisma.payment.groupBy({ by: ["clientId"], where: mine, _sum: { amount: true } }),
      // Seanslar uchun — "O'tdi"/"Kelmadi" narxi; markaz panelidagi hisob bilan bir xil
      prisma.session.groupBy({
        by: ["clientId"],
        where: { ...mine, status: { in: BILLABLE_STATUSES } },
        _sum: { price: true },
      }),
    ]);

  if (children.length === 0) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <div className="app-card p-5 text-center">
          <p className="text-base font-bold">{t("Farzand biriktirilmagan")}</p>
          <p className="mt-2 text-sm app-muted">
            {t("Hisobingizga farzandingiz bog'lanmagan. Iltimos, markaz administratoriga yoki logopedingizga murojaat qiling.")}
          </p>
        </div>
      </main>
    );
  }

  const child = children.find((c) => c.id === childRaw) ?? children[0];
  const ofChild = <T extends { clientId: string }>(rows: T[]) =>
    rows.filter((r) => r.clientId === child.id);
  const upcoming = ofChild(upcomingAll).slice(0, 10);
  const history = ofChild(historyAll).slice(0, 15);
  const payments = ofChild(paymentsAll).slice(0, 50);
  const team = ofChild(teamAll);
  const doneCount = doneAll.find((r) => r.clientId === child.id)?._count._all ?? 0;
  const cancelDeadline = new Date(now.getTime() + PARENT_CANCEL_MIN_HOURS * 3_600_000);

  // So'rov 60 ta bilan cheklangan — ota-onaga aniq son emas, umumiy manzara kerak
  const plannedCount = ofChild(upcomingAll).length;
  const paidTotal = paidAll.find((r) => r.clientId === child.id)?._sum.amount ?? 0;
  const earnedTotal = earnedAll.find((r) => r.clientId === child.id)?._sum.price ?? 0;
  // Musbat — oldindan to'langan (keyingi seanslarga), manfiy — to'lanmagan qism
  const balance = paidTotal - earnedTotal;
  const balanceView = (
    <span className={balance < 0 ? "text-rose-600" : balance > 0 ? "text-emerald-600" : ""}>
      {balance > 0 ? "+" : balance < 0 ? "−" : ""}
      {money(Math.abs(balance))}
    </span>
  );
  const next = upcoming[0] ?? null;

  const link = (params: Record<string, string>) => {
    const p = new URLSearchParams({ child: child.id, tab, ...params });
    return `/m?${p.toString()}`;
  };

  // Yakka logopedning mijozi markazni emas, logopedni ko'rishi kerak: filial
  // nomi ichki ("Ism (yakka)"), ota-onaga uning o'zi qo'ygan nomi yoki ismi
  const solo = child.branch.isSolo;
  const providerName = solo
    ? child.branch.brandName || child.branch.name.replace(/ \(yakka\)( \d+)?$/, "")
    : child.branch.name;

  return (
    <main className="mx-auto max-w-md px-4 pb-10 pt-4">
      <header className="mb-3">
        <p className="text-base font-bold">{child.fullName}</p>
        <p className="text-xs app-muted" data-testid="parent-provider">
          {t.age(child.birthDate)} · {providerName}
        </p>
      </header>

      {children.length > 1 ? (
        <nav className="mb-3 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children.map((c) => (
            <Link
              key={c.id}
              href={`/m?child=${c.id}&tab=${tab}`}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium ${
                c.id === child.id ? "app-accent" : "app-card app-muted"
              }`}
            >
              {c.fullName.split(" ")[0]}
            </Link>
          ))}
        </nav>
      ) : null}

      {/* Keyingi mashg'ulot — eng kerakli ma'lumot yuqorida */}
      <section className="app-card mb-3 p-4">
        <p className="text-xs app-muted">{t("Keyingi mashg'ulot")}</p>
        {next ? (
          <>
            <p className="mt-1 text-lg font-bold">
              {t.weekday(next.startsAt)}, {timeUz(next.startsAt)}
            </p>
            <p className="text-sm">
              {dateShort(next.startsAt)} ·{" "}
              {t(specLabel(next.specialist.specialization))}
            </p>
            <p className="text-xs app-muted">
              {next.specialist.user.fullName} · {t("{n} daqiqa", { n: next.durationMin })}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm app-muted">{t("Rejada mashg'ulot yo'q.")}</p>
        )}
      </section>

      <ParentTabs initial={tab}>
      <ParentTabNav tabs={TABS.map((x) => ({ key: x.key, label: t(x.label) }))} />

      <TabPanel name="child">
        {(
        <div className="space-y-2" data-testid="parent-child">
          <div className="grid grid-cols-2 gap-2">
            {/* Markazda abonement yo'q — "qolgan seans" va "qarz" o'rniga
                o'tgan va rejadagi mashg'ulotlar soni */}
            <div className="app-card p-3">
              <p className="text-xs app-muted">{t("Jami o'tgan mashg'ulot")}</p>
              <p className="mt-1 text-base font-bold tabular-nums">{doneCount}</p>
            </div>
            <div className="app-card p-3">
              <p className="text-xs app-muted">{t("Rejadagi mashg'ulot")}</p>
              <p className="mt-1 text-base font-bold tabular-nums">{plannedCount}</p>
            </div>
          </div>

          <section className="app-card p-3">
            <p className="text-xs app-muted">{t("Qoldiq")}</p>
            <p className="mt-1 text-base font-bold tabular-nums" data-testid="parent-balance-short">
              {balanceView}
            </p>
            <p className="text-[11px] app-muted">
              {balance < 0
                ? t("to'lanmagan qism")
                : balance > 0
                  ? t("oldindan to'langan — keyingi mashg'ulotlarga")
                  : t("hisob teng")}
            </p>
          </section>

          <section className="app-card p-3">
            <p className="text-xs app-muted">{t("Tug'ilgan sana")}</p>
            <p className="text-sm font-medium">
              {dateShort(child.birthDate)} · {t.age(child.birthDate)}
            </p>
          </section>

          <section className="app-card p-3">
            <p className="mb-1.5 text-xs app-muted">{t("Mutaxassislar")}</p>
            {team.length === 0 ? (
              <p className="text-sm app-muted">{t("Mutaxassis hali biriktirilmagan.")}</p>
            ) : (
              <ul className="space-y-1">
                {team.map(({ specialist: sp }) => (
                  <li key={sp.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{sp.user.fullName}</span>
                    <span className="shrink-0 text-xs app-muted">
                      {t(specLabel(sp.specialization))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      </TabPanel>

      <TabPanel name="schedule">
        {(
        upcoming.length === 0 ? (
          <p className="app-card px-4 py-8 text-center text-sm app-muted">
            {t("Rejada mashg'ulot yo'q.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((s) => (
              <li key={s.id} className="app-card p-3" data-testid="parent-session">
                <div className="flex items-center gap-3">
                  <div className="w-16 shrink-0">
                    <p className="text-sm font-bold tabular-nums">{timeUz(s.startsAt)}</p>
                    <p className="text-xs app-muted">{dateShort(s.startsAt)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {t(specLabel(s.specialist.specialization))}
                    </p>
                    <p className="truncate text-xs app-muted">
                      {s.specialist.user.fullName} · {t.weekday(s.startsAt)}
                    </p>
                  </div>
                </div>
                {/* Ikki bosqichli: bitta tasodifiy bosish bilan mashg'ulot yo'qolmasin */}
                {s.startsAt >= cancelDeadline ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer select-none text-xs font-medium text-rose-600">
                      {t("Kela olmaymiz — bekor qilish")}
                    </summary>
                    <form action={cancelByParent} className="mt-2 space-y-2">
                      <input type="hidden" name="sessionId" value={s.id} />
                      <input
                        name="reason"
                        maxLength={300}
                        placeholder={t("Sababi (ixtiyoriy): kasal, safarda…")}
                        className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm"
                      />
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
                      >
                        {t("Ha, mashg'ulotni bekor qilish")}
                      </button>
                    </form>
                  </details>
                ) : (
                  <p className="mt-2 text-[11px] app-muted">
                    {solo
                      ? t("Bekor qilish uchun logopedga qo'ng'iroq qiling.")
                      : t("Bekor qilish uchun markazga qo'ng'iroq qiling.")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )
      )}
      </TabPanel>

      <TabPanel name="history">
        {(
        history.length === 0 ? (
          <p className="app-card px-4 py-8 text-center text-sm app-muted">
            {t("Hali mashg'ulot bo'lmagan.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map((s) => (
              <li key={s.id} className="app-card flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {t(specLabel(s.specialist.specialization))}
                  </p>
                  <p className="text-xs app-muted">
                    {dateShort(s.startsAt)} {timeUz(s.startsAt)} · {s.specialist.user.fullName}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium ${
                    s.status === "DONE"
                      ? "bg-emerald-100 text-emerald-700"
                      : s.status === "NO_SHOW"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {t(SESSION_STATUSES[s.status as SessionStatus])}
                </span>
              </li>
            ))}
          </ul>
        )
      )}
      </TabPanel>

      <TabPanel name="payments">
        {/* Hisob-kitob — to'lov bo'lmasa ham ko'rinadi: seans o'tgan bo'lsa,
            ota-ona qancha to'lashi kerakligini shu yerdan biladi */}
        <section className="app-card mb-2 divide-y divide-black/5 text-sm" data-testid="parent-balance">
          <div className="flex items-center justify-between p-3">
            <span className="app-muted">{t("Jami to'langan")}</span>
            <span className="font-semibold tabular-nums">{money(paidTotal)}</span>
          </div>
          <div className="flex items-center justify-between p-3">
            <span className="app-muted">{t("Seanslar uchun")}</span>
            <span className="font-semibold tabular-nums">{money(earnedTotal)}</span>
          </div>
          <div className="flex items-center justify-between p-3">
            <span className="font-semibold">{t("Qoldiq")}</span>
            <span className="text-base font-bold tabular-nums">{balanceView}</span>
          </div>
        </section>
        {clickEnabled() && !solo ? (
          <ClickPay clientId={child.id} suggested={Math.max(0, -balance)} />
        ) : null}
        {(
        payments.length === 0 ? (
          <p className="app-card px-4 py-8 text-center text-sm app-muted">
            {t("Hali to'lov qilinmagan.")}
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {payments.map((p) => (
                <li key={p.id} className="app-card flex items-center justify-between gap-3 p-3" data-testid="parent-payment">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{dateShort(p.paidAt)}</p>
                    <p className="truncate text-xs app-muted">
                      {t(PAYMENT_METHODS[p.method as PaymentMethod] ?? p.method)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-emerald-600">
                    {money(p.amount)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )
      )}
      </TabPanel>

      <TabPanel name="team">
        {(
        team.length === 0 ? (
          <p className="app-card px-4 py-8 text-center text-sm app-muted">
            {t("Mutaxassis hali biriktirilmagan.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {team.map(({ specialist: sp }) => (
              <li key={sp.id} className="app-card p-3" data-testid="parent-specialist">
                <p className="text-sm font-semibold">{sp.user.fullName}</p>
                <p className="text-xs app-muted">
                  {t(specLabel(sp.specialization))}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <a
                    href={`tel:${sp.user.phone}`}
                    className="app-accent flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
                  >
                    📞 {t("Qo'ng'iroq qilish")}
                  </a>
                  {sp.user.telegramUsername ? (
                    <TgLink
                      href={`https://t.me/${sp.user.telegramUsername}`}
                      className="app-card flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
                    >
                      ✈️ {t("Telegramda yozish")}
                    </TgLink>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs app-muted tabular-nums">{sp.user.phone}</p>
              </li>
            ))}
          </ul>
        )
      )}
      </TabPanel>

      </ParentTabs>

      <footer className="mt-4 app-card p-3 text-xs app-muted">
        <p className="font-semibold">{providerName}</p>
        {child.branch.address ? <p>{child.branch.address}</p> : null}
        {child.branch.phone ? (
          <a href={`tel:${child.branch.phone}`} className="app-link">
            {child.branch.phone}
          </a>
        ) : null}
      </footer>
    </main>
  );
}
