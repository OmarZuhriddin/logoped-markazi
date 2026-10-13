import { Fragment } from "react";
import { DateField } from "@/components/date-field";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole, NOT_SOLO, branchWhere } from "@/lib/auth";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_KEYS,
  type PaymentMethod,
} from "@/lib/constants";
import { monthRange } from "@/lib/stats";
import { dateTimeUz, toDateInput } from "@/lib/format";
import {
  Badge,
  Card,
  Empty,
  PageHeader,
  StatCard,
  btn,
  btnPrimary,
  card,
  input,
  label,
  td,
  th,
} from "@/components/ui";
import { addPayment, updatePayment } from "@/app/(app)/clients/actions";
import { getT } from "@/lib/i18n/server";

type Search = { m?: string; b?: string; pm?: string; q?: string };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireRole("OWNER", "BRANCH_ADMIN", "RECEPTION");
  const t = await getT();
  const sp = await searchParams;

  const offset = Number.parseInt(sp.m ?? "0", 10) || 0;
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const { from, to } = monthRange(base);

  const branchId = user.role === "OWNER" ? (sp.b || null) : user.branchId;
  const methodFilter = PAYMENT_METHOD_KEYS.includes(sp.pm as PaymentMethod)
    ? (sp.pm as PaymentMethod)
    : null;
  // Bitta bolaning to'lovlarini topish eng ko'p so'raladigan narsa
  const nameFilter = (sp.q ?? "").trim();

  const [payments, branches, clients, intakes] = await Promise.all([
    prisma.payment.findMany({
      where: {
        paidAt: { gte: from, lt: to },
        ...branchWhere(branchId),
        ...(methodFilter ? { method: methodFilter } : {}),
        ...(nameFilter
          ? { client: { fullName: { contains: nameFilter, mode: "insensitive" as const } } }
          : {}),
      },
      orderBy: { paidAt: "desc" },
      include: {
        client: { select: { id: true, fullName: true, status: true } },
        branch: { select: { name: true } },
      },
    }),
    user.role === "OWNER" ? prisma.branch.findMany({ where: NOT_SOLO, orderBy: { name: "asc" } }) : Promise.resolve([]),
    prisma.client.findMany({
      where: { status: "ACTIVE", ...branchWhere(branchId) },
      select: { id: true, fullName: true, branch: { select: { name: true } } },
      orderBy: [{ branch: { name: "asc" } }, { fullName: "asc" }],
    }),
    // Konsultatsiya puli ham kassaga tushadi — shu sahifada ko'rinishi kerak
    prisma.intake.findMany({
      where: {
        paidAt: { gte: from, lt: to },
        ...branchWhere(branchId),
        ...(methodFilter ? { method: methodFilter } : {}),
        ...(nameFilter
          ? { childName: { contains: nameFilter, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: { paidAt: "desc" },
      include: {
        branch: { select: { name: true } },
        specialist: { select: { user: { select: { fullName: true } } } },
      },
    }),
  ]);

  const intakeTotal = intakes.reduce((s, i) => s + i.price, 0);
  const total = payments.reduce((s, p) => s + p.amount, 0) + intakeTotal;
  const byMethod = PAYMENT_METHOD_KEYS.map((m) => ({
    method: m,
    sum:
      payments.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0) +
      intakes.filter((i) => i.method === m).reduce((s, i) => s + i.price, 0),
  }));

  // Egasi barcha filiallarni ko'radi — ro'yxatni filial bo'yicha guruhlaymiz
  const clientGroups = new Map<string, typeof clients>();
  for (const c of clients) {
    const list = clientGroups.get(c.branch.name) ?? [];
    list.push(c);
    clientGroups.set(c.branch.name, list);
  }

  /** Mijoz ro'yxati: egasi hamma filialni ko'rsa — filial bo'yicha guruhlangan */
  const clientOptions = () =>
    user.role === "OWNER" && !branchId
      ? [...clientGroups.entries()].map(([branchName, items]) => (
          <optgroup key={branchName} label={branchName}>
            {items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </optgroup>
        ))
      : clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.fullName}
          </option>
        ));

  // Qabulxona xodimi faqat bugun kiritilgan to'lovni tuzata oladi (serverda ham tekshiriladi)
  const todayKey = new Date().toDateString();
  const canEditPayment = (p: (typeof payments)[number]) =>
    user.role !== "RECEPTION" || p.createdAt.toDateString() === todayKey;

  const qs = (o: number) => {
    const p = new URLSearchParams();
    p.set("m", String(o));
    if (sp.b) p.set("b", sp.b);
    if (sp.pm) p.set("pm", sp.pm);
    return `/payments?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={t("To'lovlar")}
        subtitle={`${t.monthYear(from)} · ${t("{n} ta to'lov", { n: payments.length })}${
          intakes.length > 0 ? ` · ${t("{n} ta konsultatsiya", { n: intakes.length })}` : ""
        }`}
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
        <StatCard
          label={t("Jami tushum")}
          value={t.money(total)}
          hint={intakeTotal > 0 ? t("{sum} konsultatsiyadan", { sum: t.money(intakeTotal) }) : undefined}
          tone="good"
        />
        {byMethod.map((m) => (
          <StatCard key={m.method} label={t(PAYMENT_METHODS[m.method])} value={t.money(m.sum)} />
        ))}
      </div>

      <form method="get" className={`${card} my-5 flex flex-wrap items-end gap-3 p-4`}>
        <input type="hidden" name="m" value={offset} />
        {branches.length > 0 ? (
          <div className="min-w-[170px]">
            <label className={label} htmlFor="b">
              {t("Filial")}
            </label>
            <select id="b" name="b" defaultValue={sp.b ?? ""} className={input}>
              <option value="">{t("Barchasi")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="min-w-[150px]">
          <label className={label} htmlFor="pm">
            {t("To'lov usuli")}
          </label>
          <select id="pm" name="pm" defaultValue={sp.pm ?? ""} className={input}>
            <option value="">{t("Barchasi")}</option>
            {PAYMENT_METHOD_KEYS.map((m) => (
              <option key={m} value={m}>
                {t(PAYMENT_METHODS[m])}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px]">
          <label className={label} htmlFor="q">
            {t("Bola ismi")}
          </label>
          <input
            id="q"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder={t("ism bo'yicha qidirish")}
            className={input}
          />
        </div>
        <button type="submit" className={btnPrimary}>
          {t("Filtrlash")}
        </button>
        {sp.q || sp.pm || sp.b ? (
          <Link href={`/payments?m=${offset}`} className={btn}>
            {t("Tozalash")}
          </Link>
        ) : null}
      </form>

      <details data-autoclose className={`${card} mb-5 p-4`} open={payments.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
          + {t("To'lov qabul qilish")}
        </summary>
        {clients.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            {t("Avval mijoz qo'shing.")}
          </p>
        ) : (
          <>
            <form action={addPayment} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className={label} htmlFor="clientId">
                  {t("Mijoz")} *
                </label>
                {/* Bo'sh tanlov bilan boshlanadi: oldindan birinchi mijoz tanlanib tursa,
                    e'tibor berilmasa pul o'shanga yozilib ketardi */}
                <select id="clientId" name="clientId" className={input} required defaultValue="">
                  <option value="" disabled>
                    {t("Mijozni tanlang")}
                  </option>
                  {clientOptions()}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="amount">
                  {t("Summa ({currency})", { currency: t.currency })} *
                </label>
                <input
                  id="amount"
                  name="amount"
                  inputMode="numeric"
                  placeholder="500000"
                  className={input}
                  required
                />
              </div>
              <div>
                <label className={label} htmlFor="method">
                  {t("Usul")}
                </label>
                <select id="method" name="method" className={input}>
                  {PAYMENT_METHOD_KEYS.map((m) => (
                    <option key={m} value={m}>
                      {t(PAYMENT_METHODS[m])}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="paidAt">
                  {t("Sana")}
                </label>
                <DateField id="paidAt" name="paidAt" defaultValue={toDateInput(new Date())} />
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="note">
                  {t("Izoh")}
                </label>
                <input id="note" name="note" className={input} placeholder={t("ixtiyoriy")} />
              </div>
              <div className="flex items-end">
                <button type="submit" className={`${btnPrimary} w-full`}>
                  {t("Qabul qilish")}
                </button>
              </div>
            </form>
          </>
        )}
      </details>

      <div className="space-y-5">
        <Card title={t("To'lovlar ro'yxati")}>
          {payments.length === 0 ? (
            <Empty>{t("Bu davrda to'lov yo'q.")}</Empty>
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className={th}>{t("Sana")}</th>
                    <th className={th}>{t("Mijoz")}</th>
                    {!branchId ? <th className={th}>{t("Filial")}</th> : null}
                    <th className={th}>{t("Usul")}</th>
                    <th className={th}>{t("Summa")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {payments.map((p) => (
                    <Fragment key={p.id}>
                    <tr>
                      <td className={`${td} tabular-nums`}>{dateTimeUz(p.paidAt)}</td>
                      <td className={td}>
                        <Link
                          href={`/clients/${p.client.id}`}
                          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          {p.client.fullName}
                        </Link>
                        {p.note ? (
                          <span className="block max-w-[240px] truncate text-xs text-slate-400">{p.note}</span>
                        ) : null}
                      </td>
                      {!branchId ? <td className={td}>{p.branch.name}</td> : null}
                      <td className={td}>
                        <Badge>{t(PAYMENT_METHODS[p.method as PaymentMethod])}</Badge>
                      </td>
                      <td className={`${td} font-semibold tabular-nums`}>{t.money(p.amount)}</td>
                    </tr>
                    {canEditPayment(p) ? (
                      <tr>
                        <td colSpan={branchId ? 4 : 5} className="px-4 pb-2">
                          <details data-autoclose>
                            <summary className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                              ✎ {t("Tahrirlash")}
                            </summary>
                            <form
                              action={updatePayment}
                              data-testid="payment-edit-form"
                              className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5 dark:bg-slate-900/60"
                            >
                              <input type="hidden" name="paymentId" value={p.id} />
                              <div className="lg:col-span-2">
                                <label className={label}>{t("Mijoz")}</label>
                                <select name="clientId" defaultValue={p.client.id} className={input} required>
                                  {/* Faol bo'lmagan mijoz ro'yxatda yo'q — uni ham tanlangan holda ko'rsatamiz */}
                                  {clients.some((c) => c.id === p.client.id) ? null : (
                                    <option value={p.client.id}>{p.client.fullName}</option>
                                  )}
                                  {clientOptions()}
                                </select>
                              </div>
                              <div>
                                <label className={label}>{t("Summa ({currency})", { currency: t.currency })}</label>
                                <input
                                  name="amount"
                                  inputMode="numeric"
                                  defaultValue={p.amount}
                                  className={input}
                                  required
                                />
                              </div>
                              <div>
                                <label className={label}>{t("Usul")}</label>
                                <select name="method" defaultValue={p.method} className={input}>
                                  {PAYMENT_METHOD_KEYS.map((m) => (
                                    <option key={m} value={m}>
                                      {t(PAYMENT_METHODS[m])}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className={label}>{t("Sana")}</label>
                                <DateField name="paidAt" defaultValue={toDateInput(p.paidAt)} />
                              </div>
                              <div className="sm:col-span-2 lg:col-span-4">
                                <label className={label}>{t("Izoh")}</label>
                                <input name="note" defaultValue={p.note ?? ""} className={input} />
                              </div>
                              <div className="flex items-end">
                                <button type="submit" className={`${btnPrimary} w-full`}>
                                  {t("Saqlash")}
                                </button>
                              </div>
                            </form>
                          </details>
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {intakes.length > 0 ? (
          <Card
            title={t("Konsultatsiyalar")}
            subtitle={t("qabullardan tushgan pul")}
            action={
              <Link href="/intakes" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                {t("Qabullar")} →
              </Link>
            }
          >
            <div className="scroll-x">
              <table className="w-full min-w-[620px]">
                <thead className="border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className={th}>{t("Sana")}</th>
                    <th className={th}>{t("Bola")}</th>
                    <th className={th}>{t("Kim ko'rdi")}</th>
                    {!branchId ? <th className={th}>{t("Filial")}</th> : null}
                    <th className={th}>{t("Usul")}</th>
                    <th className={th}>{t("Summa")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {intakes.map((i) => (
                    <tr key={i.id}>
                      <td className={`${td} whitespace-nowrap`}>{dateTimeUz(i.paidAt!)}</td>
                      <td className={td}>{i.childName}</td>
                      <td className={td}>
                        {i.specialist?.user.fullName ?? (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      {!branchId ? <td className={td}>{i.branch.name}</td> : null}
                      <td className={td}>
                        <Badge>{t(PAYMENT_METHODS[i.method as PaymentMethod])}</Badge>
                      </td>
                      <td className={`${td} font-semibold tabular-nums`}>{t.money(i.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

      </div>
    </>
  );
}
