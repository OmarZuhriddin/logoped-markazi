import Link from "next/link";
import { requireManager, branchWhere, isSolo } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  SESSION_STATUSES,
  SESSION_STATUS_STYLE,
  SPECIALIZATIONS,
  type SessionStatus,
  type Specialization,
  specLabel,
} from "@/lib/constants";
import {
  dayRange,
  getBranchReport,
  getOverview,
  getSpecialistRows,
  monthRange,
} from "@/lib/stats";
import { num, timeUz } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui";
import { DataTable } from "@/components/data-table";

export default async function DashboardPage() {
  // Panel rahbarlarniki: ega, filial admini va yakka mutaxassis (o'ziga
  // rahbar). Markazdagi mutaxassis/ota-ona kabinetga, qabulxona jadvalga ketadi.
  const user = await requireManager();
  // Yakka mutaxassisda xodim yo'q — maosh, markaz ulushi va "kim ko'rdi"
  // ustunlari unga ma'nosiz (pulning hammasi o'ziniki)
  const solo = isSolo(user);

  const t = await getT();
  const money = t.money;
  const branchId = user.role === "OWNER" ? null : user.branchId;
  const month = monthRange();
  const today = dayRange();

  const [
    overview,
    todaySessions,
    activeClients,
    specialistRows,
    branchReport,
    noTelegram,
  ] = await Promise.all([
    getOverview({ branchId, ...month }),
    prisma.session.findMany({
      where: {
        startsAt: { gte: today.from, lt: today.to },
        ...branchWhere(branchId),
      },
      orderBy: { startsAt: "asc" },
      include: {
        client: { select: { id: true, fullName: true } },
        specialist: { include: { user: { select: { fullName: true } } } },
        branch: { select: { name: true } },
      },
    }),
    prisma.client.count({
      where: {
        status: "ACTIVE",
        ...branchWhere(branchId),
      },
    }),
    getSpecialistRows({ branchId, ...month }),
    // Filiallar kesimi faqat egaga kerak: filial admini bitta filialni ko'radi
    user.role === "OWNER" ? getBranchReport(month) : Promise.resolve([]),
    // Botga ulanmagan ota-onaga eslatma bormaydi, lekin bu hech qayerda
    // bilinmaydi — xodim "yubordik" deb o'ylab yuradi. Shuning uchun sonini
    // bosh panelda ko'rsatamiz.
    prisma.client.count({
      where: {
        status: "ACTIVE",
        ...branchWhere(branchId),
        OR: [{ parentUserId: null }, { parent: { is: { telegramId: null } } }],
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={t("Assalomu alaykum, {name}!", { name: user.fullName.split(" ")[0] })}
        subtitle={t("{month} · {branch} bo'yicha ko'rsatkichlar", {
          month: t.monthYear(new Date()),
          branch: user.branchName ?? t("barcha filiallar"),
        })}
      />

      {noTelegram > 0 ? (
        <Link
          href="/clients?tg=yoq"
          className="mb-4 block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
        >
          <b>{t("{n} ta faol mijozning", { n: noTelegram })}</b>{" "}
          {t("ota-onasi Telegram botga ulanmagan — ularga eslatma bormaydi. Ro'yxatni ko'rish →")}
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("Faol mijozlar")}
          value={num(activeClients)}
          hint={branchId ? t("bu filialda") : t("barcha filiallarda")}
        />
        <StatCard
          label={t("O'tgan seanslar")}
          value={num(overview.done)}
          hint={t("{n} ta rejada", { n: overview.planned })}
          tone="good"
        />
        <StatCard
          label={t("Davomat")}
          value={overview.attendanceRate === null ? "—" : `${overview.attendanceRate}%`}
          hint={t("{n} ta kelmadi", { n: overview.noShow })}
          tone={
            overview.attendanceRate === null
              ? "default"
              : overview.attendanceRate >= 85
                ? "good"
                : overview.attendanceRate >= 70
                  ? "warn"
                  : "bad"
          }
        />
        <StatCard
          label={t("Kassaga tushgan")}
          value={money(overview.collected)}
          hint={t("xizmat qiymati {sum}", { sum: money(overview.earned) })}
        />
      </div>

      {/* Markazda abonement yo'q — qarzdorlik ham yo'q: har seans kelganda to'lanadi */}
      <div className={`mt-3 grid grid-cols-2 gap-3 ${solo ? "" : "lg:grid-cols-3"}`}>
          <StatCard label={t("Xizmat qiymati")} value={money(overview.earned)} hint={t("o'tgan seanslar")} />
          {solo ? (
            <StatCard label={t("Rejadagi seanslar")} value={num(overview.planned)} hint={t("shu oy")} />
          ) : (
            <>
              <StatCard
                label={t("Mutaxassis haqi")}
                value={money(overview.salary)}
                hint={t("hisoblangan")}
                tone="warn"
              />
              <StatCard
                label={t("Markaz ulushi")}
                value={money(overview.earned - overview.salary)}
                hint={t("xizmat qiymati − ish haqi")}
                tone="good"
              />
            </>
          )}
      </div>

      {branchReport.length > 1 ? (
        <Card
          title={t("Filiallar bo'yicha (shu oy)")}
          subtitle={t("har bir filialning mijozi, bajarilgan ishi va puli")}
          className="mt-6"
          action={
            <Link href="/reports" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              {t("Batafsil hisobot →")}
            </Link>
          }
        >
          <DataTable
            testId="dash-branches"
            columns={[
              { label: t("Filial") },
              { label: t("Faol mijoz"), className: "tabular-nums" },
              { label: t("O'tgan seans"), className: "tabular-nums" },
              { label: t("Xizmat qiymati"), className: "tabular-nums" },
              { label: t("Kassaga tushgan"), className: "tabular-nums" },
            ]}
            rows={branchReport.map((b) => ({
              key: b.id,
              search: b.name,
              sort: [b.name, b.clients, b.done, b.earned, b.collected],
              cells: [
                <span key="n" className="font-medium text-slate-800 dark:text-slate-200">{b.name}</span>,
                num(b.clients),
                num(b.done),
                money(b.earned),
                <span key="c" className="font-semibold">{money(b.collected)}</span>,
              ],
            }))}
            footer={[
              t("Jami"),
              num(branchReport.reduce((n, b) => n + b.clients, 0)),
              num(branchReport.reduce((n, b) => n + b.done, 0)),
              money(branchReport.reduce((n, b) => n + b.earned, 0)),
              money(branchReport.reduce((n, b) => n + b.collected, 0)),
            ]}
          />
        </Card>
      ) : null}

      <div className="mt-6">
        <Card
          title={t("Bugungi jadval")}
          subtitle={t("{n} ta seans", { n: todaySessions.length })}
          action={
            <Link href="/schedule" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              {t("Butun hafta →")}
            </Link>
          }
        >
          <DataTable
            testId="dash-today"
            minWidth="min-w-[640px]"
            empty={t("Bugunga seans belgilanmagan.")}
            columns={[
              { label: t("Vaqt"), className: "font-semibold tabular-nums" },
              { label: t("Mijoz") },
              ...(!solo ? [{ label: t("Mutaxassis") }] : []),
              ...(!branchId ? [{ label: t("Filial") }] : []),
              { label: t("Holat") },
            ]}
            rows={todaySessions.map((s) => {
              const spec = t(specLabel(s.specialist.specialization));
              const status = t(SESSION_STATUSES[s.status as SessionStatus]);
              return {
                key: s.id,
                search: [s.client.fullName, s.specialist.user.fullName, spec, s.branch.name, status].join(" "),
                sort: [
                  s.startsAt.getTime(),
                  s.client.fullName,
                  ...(!solo ? [s.specialist.user.fullName] : []),
                  ...(!branchId ? [s.branch.name] : []),
                  status,
                ],
                cells: [
                  timeUz(s.startsAt),
                  <Link
                    key="c"
                    href={`/clients/${s.client.id}`}
                    className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    {s.client.fullName}
                  </Link>,
                  ...(!solo
                    ? [
                        <span key="s">
                          {s.specialist.user.fullName}
                          <span className="block text-xs text-slate-400">{spec}</span>
                        </span>,
                      ]
                    : []),
                  ...(!branchId ? [s.branch.name] : []),
                  <Badge key="b" className={SESSION_STATUS_STYLE[s.status as SessionStatus]}>
                    {status}
                  </Badge>,
                ],
              };
            })}
          />
        </Card>
      </div>

      {/* To'liq kenglikda: tor ustunda ish haqi ustuni sig'may, kesilib qolardi.
          Yakka mutaxassisda bu jadval faqat o'zidan iborat bo'lardi — ko'rsatilmaydi */}
      {solo ? null : (
      <Card
        title={t("Mutaxassislar")}
        subtitle={t("{month} natijalari", { month: t.monthYear(new Date()) })}
        className="mt-5"
      >
        <DataTable
          testId="dash-specialists"
          empty={t("Mutaxassis qo'shilmagan.")}
          columns={[
            { label: t("Mutaxassis") },
            { label: t("Yo'nalish") },
            ...(!branchId ? [{ label: t("Filial") }] : []),
            { label: t("Mijoz"), className: "tabular-nums" },
            { label: t("O'tdi"), className: "tabular-nums" },
            { label: t("Ish haqi"), className: "tabular-nums" },
          ]}
          rows={specialistRows.map((sp) => {
            const spec = t(specLabel(sp.specialization));
            return {
              key: sp.id,
              search: `${sp.fullName} ${spec} ${sp.branchName}`,
              sort: [
                sp.fullName,
                spec,
                ...(!branchId ? [sp.branchName] : []),
                sp.clients,
                sp.done,
                sp.salary,
              ],
              cells: [
                <span key="n" className="font-medium text-slate-800 dark:text-slate-200">{sp.fullName}</span>,
                spec,
                ...(!branchId ? [sp.branchName] : []),
                sp.clients,
                sp.done,
                <span key="s" className="font-semibold">{money(sp.salary)}</span>,
              ],
            };
          })}
        />
      </Card>
      )}
    </>
  );
}