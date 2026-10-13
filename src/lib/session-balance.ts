import "server-only";
import { prisma } from "@/lib/prisma";
import { BILLABLE_STATUSES } from "@/lib/constants";

/**
 * Yangi seans yozilganda mijozning puli yetadimi.
 *
 * Qoldiq Mijozlar ro'yxatidagi bilan bir xil (to'langan − "O'tdi"/"Kelmadi"
 * seanslar narxi), lekin undan ham rejadagi (hali o'tmagan) seanslarning narxi
 * ayriladi: aks holda bitta mijozga o'nta seans ketma-ket yozilsa, har biri
 * "pul yetadi" bo'lib ko'rinardi. Rejadagi seansning narxi o'tgunicha 0 turadi,
 * shuning uchun u abonement yoki xizmat narxidan olinadi.
 */
export async function sessionBalance(clientId: string, newPrice: number) {
  const [paid, earned, planned] = await Promise.all([
    prisma.payment.aggregate({ where: { clientId }, _sum: { amount: true } }),
    prisma.session.aggregate({
      where: { clientId, status: { in: BILLABLE_STATUSES } },
      _sum: { price: true },
    }),
    prisma.session.findMany({
      where: { clientId, status: "PLANNED" },
      select: {
        price: true,
        package: { select: { pricePerSession: true } },
        sessionType: { select: { price: true } },
      },
    }),
  ]);
  const committed = planned.reduce(
    (sum, s) => sum + (s.price || s.package?.pricePerSession || s.sessionType?.price || 0),
    0,
  );
  const balance = (paid._sum.amount ?? 0) - (earned._sum.price ?? 0) - committed;
  return {
    balance,
    price: newPrice,
    /** Seans yozilgach mijoz qarzi (0 — qarz yo'q) */
    debtAfter: Math.max(0, newPrice - balance),
    short: newPrice > 0 && balance < newPrice,
  };
}
