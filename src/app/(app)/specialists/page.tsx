import { Fragment } from "react";
import { TableTools } from "@/components/table-tools";
import { requireRole, NOT_SOLO, branchWhere } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { PAYMENT_METHODS, PAYMENT_METHOD_KEYS, specLabel } from "@/lib/constants";
import { getSpecialistBalances, getSpecialistRows, monthRange } from "@/lib/stats";
import { dateShort, toDateInput } from "@/lib/format";
import {
  Badge,
  Card,
  Empty,
  PageHeader,
  btn,
  btnPrimary,
  card,
  input,
  label,
  td,
  th,
} from "@/components/ui";
import {
  createOwner,
  createReception,
  createSpecialist,
  deletePayout,
  paySalary,
  toggleOwnerActive,
  updateOwner,
  toggleReceptionActive,
  toggleSpecialistActive,
  updateReception,
  updateSpecialist,
} from "./actions";
import { getT } from "@/lib/i18n/server";

export default async function SpecialistsPage() {
  const user = await requireRole("OWNER", "BRANCH_ADMIN");
  const t = await getT();
  const branchId = user.role === "OWNER" ? null : user.branchId;
  const settings = await getSettings();
  const month = monthRange();

  const [rows, inactive, branches, balances, payouts, reception, owners, specialistPhones] =
    await Promise.all([
    getSpecialistRows({ branchId, ...month }),
    prisma.specialist.findMany({
      where: { isActive: false, ...branchWhere(branchId) },
      include: { user: { select: { fullName: true } }, branch: { select: { name: true } } },
    }),
    user.role === "OWNER" ? prisma.branch.findMany({ where: NOT_SOLO, orderBy: { name: "asc" } }) : Promise.resolve([]),
    getSpecialistBalances({ branchId }),
    prisma.salaryPayout.findMany({
      where: { ...branchWhere(branchId) },
      orderBy: { paidAt: "desc" },
      take: 15,
      include: { specialist: { include: { user: { select: { fullName: true } } } } },
    }),
    prisma.user.findMany({
      where: { role: "RECEPTION", ...branchWhere(branchId) },
      include: { branch: { select: { name: true } } },
      orderBy: { fullName: "asc" },
    }),
    // Egalik akkauntlari faqat eganing o'ziga ko'rinadi
    user.role === "OWNER"
      ? prisma.user.findMany({ where: { role: "OWNER" }, orderBy: { fullName: "asc" } })
      : Promise.resolve([]),
    // Tahrirlash formasi uchun telefon raqamlar (hisobot qatorlarida yo'q)
    prisma.specialist.findMany({
      where: { ...branchWhere(branchId) },
      select: { id: true, user: { select: { phone: true, telegramId: true } } },
    }),
  ]);

  const phoneOf = new Map(specialistPhones.map((x) => [x.id, x.user.phone]));
  // Botga ulanmagan xodim eslatma ham, zaxira ham olmaydi — buni ko'rsatib turamiz
  const tgOf = new Map(specialistPhones.map((x) => [x.id, Boolean(x.user.telegramId)]));

  const totalSalary = rows.reduce((s, r) => s + r.salary, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <>
      <PageHeader
        title={t("Xodimlar")}
        subtitle={t("{n} ta faol mutaxassis · {month}: xizmat {revenue}, ish haqi {salary}", {
          n: rows.length,
          month: t.monthYear(new Date()),
          revenue: t.money(totalRevenue),
          salary: t.money(totalSalary),
        })}
      />

      <details data-autoclose className={`${card} mb-5 p-4`}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
          + {t("Yangi mutaxassis qo'shish")}
        </summary>
        <form action={createSpecialist} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label} htmlFor="fullName">
              {t("F.I.Sh.")} *
            </label>
            <input id="fullName" name="fullName" className={input} required />
          </div>
          <div>
            <label className={label} htmlFor="specialization">
              {t("Mutaxassislik")} *
            </label>
            <input
              id="specialization"
              name="specialization"
              className={input}
              maxLength={60}
              placeholder={t("Masalan: Logoped")}
              required
            />
          </div>
          {branches.length > 0 ? (
            <div>
              <label className={label} htmlFor="branchId">
                {t("Filial")} *
              </label>
              <select id="branchId" name="branchId" className={input} required>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className={label} htmlFor="phone">
              {t("Telefon (login)")} *
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+998901234567"
              className={input}
              required
            />
          </div>
          <div>
            <label className={label} htmlFor="password">
              {t("Parol")} *
            </label>
            <input id="password" name="password" type="text" className={input} required />
          </div>
          <div className="flex items-end">
            <button type="submit" className={`${btnPrimary} w-full`}>
              {t("Qo'shish")}
            </button>
          </div>
        </form>
      </details>

      <Card title={t("{month} natijalari", { month: t.monthYear(new Date()) })}>
        {rows.length === 0 ? (
          <Empty>{t("Mutaxassis yo'q.")}</Empty>
        ) : (
          <TableTools>
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className={th}>{t("Mutaxassis")}</th>
                  <th className={th}>{t("Yo'nalish")}</th>
                  {!branchId ? <th className={th}>{t("Filial")}</th> : null}
                  <th className={th}>{t("Mijoz")}</th>
                  <th className={th}>{t("O'tdi")}</th>
                  <th className={th}>{t("Kelmadi")}</th>
                  <th className={th}>{t("Rejada")}</th>
                  <th className={th}>{t("Xizmat qiymati")}</th>
                  <th className={th}>{t("Ish haqi")}</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => (
                  <Fragment key={r.id}>
                  <tr>
                    <td className={`${td} font-medium`}>
                      {r.fullName}
                      {tgOf.get(r.id) ? null : (
                        <span className="block text-xs font-normal text-amber-600 dark:text-amber-400">
                          {t("Telegram yo'q")}
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      <Badge>{t(specLabel(r.specialization))}</Badge>
                    </td>
                    {!branchId ? <td className={td}>{r.branchName}</td> : null}
                    <td className={`${td} tabular-nums`}>{r.clients}</td>
                    <td className={`${td} font-semibold tabular-nums text-emerald-600 dark:text-emerald-400`}>
                      {r.done}
                    </td>
                    <td className={`${td} tabular-nums`}>{r.noShow}</td>
                    <td className={`${td} tabular-nums`}>{r.planned}</td>
                    <td className={`${td} tabular-nums`}>{t.money(r.revenue)}</td>
                    <td className={`${td} font-semibold tabular-nums`}>{t.money(r.salary)}</td>
                    <td className={td}>
                      <form action={toggleSpecialistActive}>
                        <input type="hidden" name="specialistId" value={r.id} />
                        <button type="submit" className="text-xs text-slate-400 hover:text-rose-600">
                          {t("bo'shatish")}
                        </button>
                      </form>
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td colSpan={branchId ? 10 : 11} className="px-4 pb-2">
                      <details data-autoclose>
                        <summary className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                          ✎ {t("Tahrirlash")}
                        </summary>
                        <form
                          action={updateSpecialist}
                          className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4 dark:bg-slate-900/60"
                        >
                          <input type="hidden" name="specialistId" value={r.id} />
                          <div>
                            <label className={label}>{t("F.I.Sh.")}</label>
                            <input name="fullName" defaultValue={r.fullName} className={input} required />
                          </div>
                          <div>
                            <label className={label}>{t("Telefon (login)")}</label>
                            <input
                              name="phone"
                              type="tel"
                              defaultValue={phoneOf.get(r.id) ?? ""}
                              className={input}
                              required
                            />
                          </div>
                          <div>
                            <label className={label}>{t("Mutaxassislik")}</label>
                            <input
                              name="specialization"
                              defaultValue={specLabel(r.specialization)}
                              className={input}
                              maxLength={60}
                              required
                            />
                          </div>
                          {branches.length > 0 ? (
                            <div>
                              <label className={label}>{t("Filial")}</label>
                              <select
                                name="branchId"
                                defaultValue={branches.find((b) => b.name === r.branchName)?.id ?? ""}
                                className={input}
                              >
                                {branches.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                          <div>
                            <label className={label}>{t("Yangi parol")}</label>
                            <input
                              name="password"
                              type="text"
                              placeholder={t("o'zgartirmasangiz bo'sh qoldiring")}
                              className={input}
                            />
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
                  </Fragment>
                ))}
              </tbody>
            </table>
          </TableTools>
        )}
      </Card>

      <Card
        title={t("Ish haqi hisob-kitobi")}
        subtitle={t("boshidan beri: hisoblangan − to'langan = qolgan")}
        className="mt-5"
      >
        <TableTools>
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className={th}>{t("Mutaxassis")}</th>
                {!branchId ? <th className={th}>{t("Filial")}</th> : null}
                <th className={th}>{t("Hisoblangan")}</th>
                <th className={th}>{t("To'langan")}</th>
                <th className={th}>{t("Qolgan")}</th>
                <th className={th}>{t("To'lab berish")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {balances.map((b) => (
                <tr key={b.specialistId}>
                  <td className={`${td} font-medium`}>
                    {b.fullName}
                    <span className="block text-xs text-slate-400">
                      {t(specLabel(b.specialization))}
                    </span>
                  </td>
                  {!branchId ? <td className={td}>{b.branchName}</td> : null}
                  <td className={`${td} tabular-nums`}>{t.money(b.accrued)}</td>
                  <td className={`${td} tabular-nums`}>{t.money(b.paid)}</td>
                  <td className={`${td} font-semibold tabular-nums`}>
                    <span
                      className={
                        b.balance > 0
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      {t.money(b.balance)}
                    </span>
                  </td>
                  <td className={td}>
                    <form action={paySalary} className="flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="specialistId" value={b.specialistId} />
                      <input type="hidden" name="paidAt" value={toDateInput(new Date())} />
                      <input
                        name="amount"
                        inputMode="numeric"
                        defaultValue={b.balance > 0 ? String(b.balance) : ""}
                        placeholder={t("summa")}
                        className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                        aria-label={t("To'lov summasi")}
                        required
                      />
                      <select
                        name="method"
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950"
                        aria-label={t("To'lov usuli")}
                      >
                        {PAYMENT_METHOD_KEYS.map((m) => (
                          <option key={m} value={m}>
                            {t(PAYMENT_METHODS[m])}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-xs font-semibold text-indigo-600 hover:underline">
                        {t("to'lash")}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableTools>

        {payouts.length > 0 ? (
          <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("Oxirgi to'lovlar")}
            </p>
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-slate-700 dark:text-slate-300">
                    {dateShort(p.paidAt)} · {p.specialist.user.fullName}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                      {t.money(p.amount)}
                    </span>
                    <form action={deletePayout}>
                      <input type="hidden" name="payoutId" value={p.id} />
                      <button
                        type="submit"
                        className="text-xs text-slate-400 hover:text-rose-600"
                        title={t("O'chirish")}
                      >
                        ✕
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {user.role === "OWNER" ? (
        <Card
          title={t("Markaz egalari")}
          subtitle={t("hamma filialni va hamma bo'limni ko'radi")}
          className="mt-5"
        >
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {owners.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    {o.fullName}
                    {o.id === user.id ? (
                      <span className="ml-2 text-xs font-normal text-indigo-600 dark:text-indigo-400">
                        (siz)
                      </span>
                    ) : null}
                    {!o.isActive ? (
                      <span className="ml-2 text-xs font-normal text-slate-400">{t("(faol emas)")}</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-slate-400">{o.phone}</p>

                  {/* Qabulxona xodimlaridagidek: ism, login va parolni shu yerda tuzatish */}
                  <details data-autoclose className="mt-1" data-testid="owner-edit">
                    <summary className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                      ✎ {t("Tahrirlash")}
                    </summary>
                    <form
                      action={updateOwner}
                      className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4 dark:bg-slate-900/60"
                    >
                      <input type="hidden" name="userId" value={o.id} />
                      <div>
                        <label className={label}>{t("F.I.Sh.")}</label>
                        <input name="fullName" defaultValue={o.fullName} className={input} required />
                      </div>
                      <div>
                        <label className={label}>{t("Telefon (login)")}</label>
                        <input name="phone" type="tel" defaultValue={o.phone} className={input} required />
                      </div>
                      <div>
                        <label className={label}>{t("Yangi parol")}</label>
                        <input
                          name="password"
                          type="text"
                          placeholder={t("o'zgartirmasangiz bo'sh qoldiring")}
                          className={input}
                        />
                      </div>
                      <div className="flex items-end">
                        <button type="submit" className={`${btnPrimary} w-full`}>
                          {t("Saqlash")}
                        </button>
                      </div>
                    </form>
                  </details>
                </div>
                {o.id === user.id ? null : (
                  <form action={toggleOwnerActive}>
                    <input type="hidden" name="userId" value={o.id} />
                    <button
                      type="submit"
                      className={
                        o.isActive
                          ? "text-xs text-slate-400 hover:text-rose-600"
                          : "text-xs font-semibold text-indigo-600 hover:underline"
                      }
                    >
                      {o.isActive ? t("o'chirish") : t("qaytarish")}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>

          <details data-autoclose className="border-t border-slate-200 p-4 dark:border-slate-800">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
              + {t("Egalik akkaunti qo'shish")}
            </summary>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t("Yangi ega sizdek to'liq huquqqa ega bo'ladi: hamma filial, to'lovlar, ish haqi va hisobotlar. Faqat ishonchli odamga bering.")}
            </p>
            <form action={createOwner} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={label} htmlFor="oFullName">
                  {t("F.I.Sh.")} *
                </label>
                <input id="oFullName" name="fullName" className={input} required />
              </div>
              <div>
                <label className={label} htmlFor="oPhone">
                  {t("Telefon (login)")} *
                </label>
                <input
                  id="oPhone"
                  name="phone"
                  type="tel"
                  placeholder="+998901234567"
                  className={input}
                  required
                />
              </div>
              <div>
                <label className={label} htmlFor="oPassword">
                  {t("Parol")} *
                </label>
                <input id="oPassword" name="password" type="text" className={input} required />
              </div>
              <div className="flex items-end">
                <button type="submit" className={`${btnPrimary} w-full`}>
                  {t("Qo'shish")}
                </button>
              </div>
            </form>
          </details>
        </Card>
      ) : null}

      <Card
        title={t("Qabulxona xodimlari")}
        subtitle={t("mijoz qabul qiladi va to'lov oladi; maosh, hisobot va xodimlar bo'limi ularga ko'rinmaydi")}
        className="mt-5"
      >
        {reception.length === 0 ? (
          <Empty>{t("Qabulxona xodimi qo'shilmagan.")}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {reception.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    {r.fullName}
                    {!r.isActive ? (
                      <span className="ml-2 text-xs font-normal text-slate-400">{t("(faol emas)")}</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {r.phone}
                    {!branchId ? ` · ${r.branch?.name ?? ""}` : ""}
                  </p>
                  {r.telegramId ? null : (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{t("Telegram yo'q")}</p>
                  )}

                  <details data-autoclose className="mt-1">
                    <summary className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                      ✎ {t("Tahrirlash")}
                    </summary>
                    <form
                      action={updateReception}
                      className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4 dark:bg-slate-900/60"
                    >
                      <input type="hidden" name="userId" value={r.id} />
                      <div>
                        <label className={label}>{t("F.I.Sh.")}</label>
                        <input name="fullName" defaultValue={r.fullName} className={input} required />
                      </div>
                      <div>
                        <label className={label}>{t("Telefon (login)")}</label>
                        <input name="phone" type="tel" defaultValue={r.phone} className={input} required />
                      </div>
                      {branches.length > 0 ? (
                        <div>
                          <label className={label}>{t("Filial")}</label>
                          <select name="branchId" defaultValue={r.branchId ?? ""} className={input}>
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      <div>
                        <label className={label}>{t("Yangi parol")}</label>
                        <input
                          name="password"
                          type="text"
                          placeholder={t("o'zgartirmasangiz bo'sh qoldiring")}
                          className={input}
                        />
                      </div>
                      <div className="flex items-end">
                        <button type="submit" className={`${btnPrimary} w-full`}>
                          {t("Saqlash")}
                        </button>
                      </div>
                    </form>
                  </details>
                </div>
                <form action={toggleReceptionActive}>
                  <input type="hidden" name="userId" value={r.id} />
                  <button
                    type="submit"
                    className={
                      r.isActive
                        ? "text-xs text-slate-400 hover:text-rose-600"
                        : "text-xs font-semibold text-indigo-600 hover:underline"
                    }
                  >
                    {r.isActive ? t("bo'shatish") : t("qaytarish")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <details data-autoclose className="border-t border-slate-200 p-4 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
            + {t("Qabulxona xodimi qo'shish")}
          </summary>
          <form action={createReception} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={label} htmlFor="rFullName">
                {t("F.I.Sh.")} *
              </label>
              <input id="rFullName" name="fullName" className={input} required />
            </div>
            <div>
              <label className={label} htmlFor="rPhone">
                {t("Telefon (login)")} *
              </label>
              <input
                id="rPhone"
                name="phone"
                type="tel"
                placeholder="+998901234567"
                className={input}
                required
              />
            </div>
            <div>
              <label className={label} htmlFor="rPassword">
                {t("Parol")} *
              </label>
              <input id="rPassword" name="password" type="text" className={input} required />
            </div>
            {branches.length > 0 ? (
              <div>
                <label className={label} htmlFor="rBranch">
                  {t("Filial")} *
                </label>
                <select id="rBranch" name="branchId" className={input} required>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex items-end">
              <button type="submit" className={`${btnPrimary} w-full`}>
                {t("Qo'shish")}
              </button>
            </div>
          </form>
        </details>
      </Card>

      {inactive.length > 0 ? (
        <Card title={t("Faol bo'lmaganlar")} className="mt-5">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {inactive.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {s.user.fullName}
                  </p>
                  <p className="text-xs text-slate-400">
                    {t(specLabel(s.specialization))} · {s.branch.name}
                  </p>
                </div>
                <form action={toggleSpecialistActive}>
                  <input type="hidden" name="specialistId" value={s.id} />
                  <button type="submit" className={btn}>
                    {t("Qaytarish")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
