import { prisma } from "@/lib/prisma";
import { TableTools } from "@/components/table-tools";
import { requireRole, NOT_SOLO } from "@/lib/auth";
import { num } from "@/lib/format";
import { monthRange } from "@/lib/stats";
import {
  Card,
  Empty,
  PageHeader,
  btnPrimary,
  card,
  input,
  label,
  td,
  th,
} from "@/components/ui";
import { createBranch, deleteBranch, updateBranch } from "./actions";
import { getT } from "@/lib/i18n/server";

export default async function BranchesPage() {
  await requireRole("OWNER");
  const t = await getT();
  const { from, to } = monthRange();

  const branches = await prisma.branch.findMany({
    where: NOT_SOLO,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { clients: true, specialists: true, intakes: true } },
    },
  });

  // Shu oydagi tushum — qaysi filial qancha ishlayotganini ko'rsatadi
  const income = await Promise.all(
    branches.map(async (b) => {
      const [pay, intake] = await Promise.all([
        prisma.payment.aggregate({
          where: { branchId: b.id, paidAt: { gte: from, lt: to } },
          _sum: { amount: true },
        }),
        prisma.intake.aggregate({
          where: { branchId: b.id, paidAt: { gte: from, lt: to } },
          _sum: { price: true },
        }),
      ]);
      return (pay._sum.amount ?? 0) + (intake._sum.price ?? 0);
    }),
  );

  return (
    <>
      <PageHeader
        title={t("Filiallar")}
        subtitle={t("{n} ta filial", { n: branches.length })}
      />

      <details data-autoclose className={`${card} mb-5 p-4`} open={branches.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
          + {t("Yangi filial qo'shish")}
        </summary>
        <form action={createBranch} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={label} htmlFor="name">
              {t("Filial nomi")} *
            </label>
            <input
              id="name"
              name="name"
              placeholder={t("Chilonzor filiali")}
              className={input}
              required
            />
          </div>
          <div className="lg:col-span-2">
            <label className={label} htmlFor="address">
              {t("Manzil")}
            </label>
            <input id="address" name="address" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="phone">
              {t("Telefon")}
            </label>
            <input id="phone" name="phone" type="tel" className={input} />
          </div>
          <div className="flex items-end">
            <button type="submit" className={`${btnPrimary} w-full`}>
              {t("Qo'shish")}
            </button>
          </div>
        </form>
      </details>

      <Card>
        {branches.length === 0 ? (
          <Empty>{t("Hali filial qo'shilmagan.")}</Empty>
        ) : (
          <TableTools>
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className={th}>{t("Filial")}</th>
                  <th className={th}>{t("Mijoz")}</th>
                  <th className={th}>{t("Mutaxassis")}</th>
                  <th className={th}>{t("Qabul")}</th>
                  <th className={th}>{t("Shu oy tushum")}</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {branches.map((b, i) => (
                  <tr key={b.id} className="align-top">
                    <td className={td}>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {b.name}
                      </span>
                      {b.address ? (
                        <span className="block text-xs text-slate-400">{b.address}</span>
                      ) : null}
                      {b.phone ? (
                        <span className="block text-xs text-slate-400">{b.phone}</span>
                      ) : null}

                      <details data-autoclose className="mt-1">
                        <summary className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                          ✎ {t("Tahrirlash")}
                        </summary>
                        <form
                          action={updateBranch}
                          className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 dark:bg-slate-900/60"
                        >
                          <input type="hidden" name="branchId" value={b.id} />
                          <div>
                            <label className={label}>{t("Nomi")}</label>
                            <input name="name" defaultValue={b.name} className={input} required />
                          </div>
                          <div>
                            <label className={label}>{t("Manzil")}</label>
                            <input name="address" defaultValue={b.address ?? ""} className={input} />
                          </div>
                          <div>
                            <label className={label}>{t("Telefon")}</label>
                            <input name="phone" defaultValue={b.phone ?? ""} className={input} />
                          </div>
                          <div className="flex items-end">
                            <button type="submit" className={`${btnPrimary} w-full`}>
                              {t("Saqlash")}
                            </button>
                          </div>
                        </form>
                      </details>
                    </td>
                    <td className={`${td} tabular-nums`}>{num(b._count.clients)}</td>
                    <td className={`${td} tabular-nums`}>{num(b._count.specialists)}</td>
                    <td className={`${td} tabular-nums`}>{num(b._count.intakes)}</td>
                    <td className={`${td} font-semibold tabular-nums`}>{t.money(income[i])}</td>
                    <td className={td}>
                      <form action={deleteBranch}>
                        <input type="hidden" name="branchId" value={b.id} />
                        <button
                          type="submit"
                          className="text-xs text-slate-400 hover:text-rose-600"
                        >
                          {t("o'chirish")}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableTools>
        )}
      </Card>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        {t("Filialni faqat bo'sh bo'lsa o'chirish mumkin. Ichida mijoz, mutaxassis yoki to'lov bo'lsa, o'chirish o'rniga nomini o'zgartiring.")}
      </p>
    </>
  );
}
