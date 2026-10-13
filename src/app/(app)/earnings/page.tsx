import { requireRole } from "@/lib/auth";
import { TableTools } from "@/components/table-tools";
import { prisma } from "@/lib/prisma";
import {
  PAYMENT_METHODS,
  SESSION_STATUSES,
  SESSION_STATUS_STYLE,
  type PaymentMethod,
  type SessionStatus,
} from "@/lib/constants";
import { getSpecialistEarnings, monthRange } from "@/lib/stats";
import { dateShort, timeUz } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, StatCard, td, th } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export default async function EarningsPage() {
  const user = await requireRole("SPECIALIST");
  const t = await getT();
  const specialistId = user.specialistId!;
  const month = monthRange();

  const [earnings, sessions, payouts, specialist] = await Promise.all([
    getSpecialistEarnings(specialistId),
    prisma.session.findMany({
      where: {
        specialistId,
        startsAt: { gte: month.from, lt: month.to },
        status: { in: ["DONE", "NO_SHOW"] },
      },
      orderBy: { startsAt: "desc" },
      include: { client: { select: { fullName: true } } },
    }),
    prisma.salaryPayout.findMany({
      where: { specialistId },
      orderBy: { paidAt: "desc" },
      take: 20,
    }),
    prisma.specialist.findUnique({
      where: { id: specialistId },
      select: { salaryPercent: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={t("Pulim")}
        // Ulush xizmatga qarab har xil — har bir seans qatorida o'z foizi ko'rinadi
        subtitle={`${t("ulush har bir xizmatda o'zicha")} · ${t.monthYear(new Date())}`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("Qolgan (olishim kerak)")}
          value={t.money(earnings.balance)}
          hint={t("hisoblangan − to'langan")}
          tone={earnings.balance > 0 ? "warn" : "good"}
        />
        <StatCard
          label={t("Shu oyda hisoblangan")}
          value={t.money(earnings.accruedMonth)}
          hint={t("{n} seans o'tdi", { n: earnings.doneMonth })}
          tone="good"
        />
        <StatCard label={t("Jami hisoblangan")} value={t.money(earnings.accruedTotal)} hint={t("boshidan beri")} />
        <StatCard label={t("Jami to'langan")} value={t.money(earnings.paidTotal)} hint={t("qo'lga tekkan")} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card
          title={t("{month} seanslari", { month: t.monthYear(new Date()) })}
          subtitle={t("{n} ta hisobga kirgan seans", { n: sessions.length })}
        >
          {sessions.length === 0 ? (
            <Empty>{t("Bu oyda hisobga kirgan seans yo'q.")}</Empty>
          ) : (
            <TableTools>
              <table className="w-full min-w-[560px]">
                <thead className="border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className={th}>{t("Sana")}</th>
                    <th className={th}>{t("Mijoz")}</th>
                    <th className={th}>{t("Holat")}</th>
                    <th className={th}>{t("Seans narxi")}</th>
                    <th className={th}>{t("Menga")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sessions.map((s) => {
                    const percent = s.salaryPercent ?? specialist?.salaryPercent ?? 0;
                    return (
                      <tr key={s.id}>
                        <td className={`${td} tabular-nums`}>
                          {dateShort(s.startsAt)}
                          <span className="block text-xs text-slate-400">{timeUz(s.startsAt)}</span>
                        </td>
                        <td className={td}>{s.client.fullName}</td>
                        <td className={td}>
                          <Badge className={SESSION_STATUS_STYLE[s.status as SessionStatus]}>
                            {t(SESSION_STATUSES[s.status as SessionStatus])}
                          </Badge>
                        </td>
                        <td className={`${td} tabular-nums`}>
                          {s.price > 0 ? (
                            t.money(s.price)
                          ) : (
                            // Narx xizmatdan olinadi — xizmatsiz eski seansda
                            // 0 bo'lib qoladi va ulush ham 0 chiqadi
                            <span className="text-amber-600 dark:text-amber-400">
                              {t("belgilanmagan")}
                            </span>
                          )}
                        </td>
                        <td className={`${td} font-semibold tabular-nums`}>
                          {t.money(Math.round((s.price * percent) / 100))}
                          <span className="block text-xs font-normal text-slate-400">{percent}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableTools>
          )}
        </Card>

        <Card title={t("Qo'lga tekkan to'lovlar")} subtitle={t("markaz menga to'lab bergan summalar")}>
          {payouts.length === 0 ? (
            <Empty>{t("Hali to'lov yozilmagan.")}</Empty>
          ) : (
            <TableTools>
              <table className="w-full min-w-[420px]">
                <thead className="border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className={th}>{t("Sana")}</th>
                    <th className={th}>{t("Summa")}</th>
                    <th className={th}>{t("Usul")}</th>
                    <th className={th}>{t("Izoh")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {payouts.map((p) => (
                    <tr key={p.id}>
                      <td className={`${td} tabular-nums`}>{dateShort(p.paidAt)}</td>
                      <td className={`${td} font-semibold tabular-nums`}>{t.money(p.amount)}</td>
                      <td className={td}>
                        <Badge>{t(PAYMENT_METHODS[p.method as PaymentMethod])}</Badge>
                      </td>
                      <td className={td}>{p.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableTools>
          )}
        </Card>
      </div>
    </>
  );
}
