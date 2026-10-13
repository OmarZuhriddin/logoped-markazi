import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireManager, NOT_SOLO, branchWhere, isSolo } from "@/lib/auth";
import {
  BILLABLE_STATUSES,
  SPECIALIZATIONS,
  type SessionStatus,
  type Specialization,
  specLabel,
} from "@/lib/constants";
import { getOverview, getSpecialistRows, monthRange } from "@/lib/stats";
import { num } from "@/lib/format";
import { Card, Empty, PageHeader, StatCard, btn, td, th } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

type Search = { m?: string };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  // Yakka mutaxassis ham o'z hisobotini ko'radi — doirasi o'z filiali
  const user = await requireManager();
  const solo = isSolo(user);
  const t = await getT();
  const sp = await searchParams;

  const offset = Number.parseInt(sp.m ?? "0", 10) || 0;
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const { from, to } = monthRange(base);

  const branchId = user.role === "OWNER" ? null : user.branchId;

  const [overview, specialistRows, branches, sessions] = await Promise.all([
    getOverview({ branchId, from, to }),
    getSpecialistRows({ branchId, from, to }),
    user.role === "OWNER" ? prisma.branch.findMany({ where: NOT_SOLO, orderBy: { name: "asc" } }) : Promise.resolve([]),
    prisma.session.findMany({
      where: {
        startsAt: { gte: from, lt: to },
        ...branchWhere(branchId),
      },
      select: {
        status: true,
        price: true,
        branchId: true,
        specialist: { select: { specialization: true } },
      },
    }),
  ]);

  // Konsultatsiya puli abonement to'lovlaridan alohida yuritiladi (qabul hali
  // mijoz emas), shuning uchun hisobotda ham alohida ko'rsatiladi.
  const intakeAgg = await prisma.intake.aggregate({
    where: {
      paidAt: { gte: from, lt: to },
      ...branchWhere(branchId),
    },
    _sum: { price: true },
    _count: true,
  });

  // Filiallar kesimi
  const branchStats = await Promise.all(
    branches.map(async (b) => {
      const ov = await getOverview({ branchId: b.id, from, to });
      const clients = await prisma.client.count({
        where: { branchId: b.id, status: "ACTIVE" },
      });
      return { ...b, ...ov, clients };
    }),
  );

  // Yo'nalishlar kesimi
  const bySpec = new Map<string, { done: number; revenue: number }>();
  for (const s of sessions) {
    const key = s.specialist.specialization;
    const cur = bySpec.get(key) ?? { done: 0, revenue: 0 };
    if (s.status === "DONE") cur.done++;
    if (BILLABLE_STATUSES.includes(s.status as SessionStatus)) cur.revenue += s.price;
    bySpec.set(key, cur);
  }
  const specRows = [...bySpec.entries()]
    .map(([k, v]) => ({ specialization: k, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const qs = (o: number) => `/reports?m=${o}`;
  const profit = overview.earned - overview.salary;

  return (
    <>
      <PageHeader
        title={t("Hisobotlar")}
        subtitle={
          solo
            ? t.monthYear(from)
            : `${t.monthYear(from)} · ${user.branchName ?? t("barcha filiallar")}`
        }
        action={
          <div className="flex gap-2">
            <Link href={qs(offset - 1)} className={btn}>
              ← {t("O'tgan oy")}
            </Link>
            {offset !== 0 ? (
              <Link href={qs(0)} className={btn}>
                {t("Bu oy")}
              </Link>
            ) : null}
            {offset < 0 ? (
              <Link href={qs(offset + 1)} className={btn}>
                {t("Keyingi oy")} →
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("O'tgan seanslar")} value={num(overview.done)} tone="good" />
        <StatCard
          label={t("Davomat")}
          value={overview.attendanceRate === null ? "—" : `${overview.attendanceRate}%`}
          hint={t("{noShow} kelmadi · {cancelled} bekor", { noShow: overview.noShow, cancelled: overview.cancelled })}
        />
        <StatCard label={t("Kassaga tushgan")} value={t.money(overview.collected)} />
        <StatCard label={t("Xizmat qiymati")} value={t.money(overview.earned)} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Yakka mutaxassisda maosh va markaz ulushi yo'q — pulning hammasi o'ziniki */}
        {solo ? null : (
          <>
            <StatCard label={t("Mutaxassis haqi")} value={t.money(overview.salary)} tone="warn" />
            <StatCard
              label={t("Markaz ulushi")}
              value={t.money(profit)}
              hint={t("xizmat qiymati − ish haqi")}
              tone="good"
            />
          </>
        )}
        <StatCard label={t("Rejadagi seanslar")} value={num(overview.planned)} />
        <StatCard
          label={t("Konsultatsiyalardan")}
          value={t.money(intakeAgg._sum.price ?? 0)}
          hint={t("{n} ta to'langan qabul", { n: intakeAgg._count })}
          href="/intakes"
        />
      </div>

      {branchStats.length > 0 ? (
        <Card title={t("Filiallar kesimi")} className="mt-5">
          <div className="scroll-x">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className={th}>{t("Filial")}</th>
                  <th className={th}>{t("Faol mijoz")}</th>
                  <th className={th}>{t("O'tdi")}</th>
                  <th className={th}>{t("Davomat")}</th>
                  <th className={th}>{t("Tushum")}</th>
                  <th className={th}>{t("Xizmat qiymati")}</th>
                  <th className={th}>{t("Ish haqi")}</th>
                  <th className={th}>{t("Markaz ulushi")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {branchStats.map((b) => (
                  <tr key={b.id}>
                    <td className={`${td} font-medium`}>{b.name}</td>
                    <td className={`${td} tabular-nums`}>{b.clients}</td>
                    <td className={`${td} tabular-nums`}>{b.done}</td>
                    <td className={`${td} tabular-nums`}>
                      {b.attendanceRate === null ? "—" : `${b.attendanceRate}%`}
                    </td>
                    <td className={`${td} tabular-nums`}>{t.money(b.collected)}</td>
                    <td className={`${td} tabular-nums`}>{t.money(b.earned)}</td>
                    <td className={`${td} tabular-nums`}>{t.money(b.salary)}</td>
                    <td className={`${td} font-semibold tabular-nums`}>
                      {t.money(b.earned - b.salary)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Mutaxassis va yo'nalish kesimi yakka ishlaganda bitta qatordan iborat bo'lardi */}
      {solo ? null : (
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title={t("Mutaxassislar bo'yicha")}>
          {specialistRows.length === 0 ? (
            <Empty>{t("Ma'lumot yo'q.")}</Empty>
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[520px]">
                <thead className="border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className={th}>{t("Mutaxassis")}</th>
                    <th className={th}>{t("O'tdi")}</th>
                    <th className={th}>{t("Xizmat")}</th>
                    <th className={th}>{t("Ish haqi")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {specialistRows.map((r) => (
                    <tr key={r.id}>
                      <td className={td}>
                        {r.fullName}
                        <span className="block text-xs text-slate-400">
                          {t(specLabel(r.specialization))}
                          {!branchId ? ` · ${r.branchName}` : ""}
                        </span>
                      </td>
                      <td className={`${td} tabular-nums`}>{r.done}</td>
                      <td className={`${td} tabular-nums`}>{t.money(r.revenue)}</td>
                      <td className={`${td} font-semibold tabular-nums`}>{t.money(r.salary)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={t("Yo'nalishlar bo'yicha")}>
          {specRows.length === 0 ? (
            <Empty>{t("Ma'lumot yo'q.")}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {specRows.map((r) => {
                const max = specRows[0].revenue || 1;
                const pct = Math.round((r.revenue / max) * 100);
                return (
                  <li key={r.specialization} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {t(specLabel(r.specialization))}
                      </span>
                      <span className="tabular-nums text-slate-600 dark:text-slate-400">
                        {t("{n} seans", { n: r.done })} · {t.money(r.revenue)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      )}
    </>
  );
}
