import { getSessionTypes } from "@/lib/session-types";
import { CheckedSubmit } from "@/components/checked-submit";
import { DateField } from "@/components/date-field";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, sessionScope, clientScope, NOT_SOLO, isSolo } from "@/lib/auth";
import {
  SESSION_STATUSES,
  SESSION_STATUS_STYLE,
  SPECIALIZATIONS,
  type SessionStatus,
  type Specialization,
  specLabel,
} from "@/lib/constants";
import { addDays, weekRange } from "@/lib/stats";
import { dateShort, timeUz } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
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
} from "@/components/ui";
import { checkSessionBalance, createSession, deleteSession, setSessionStatus } from "./actions";

type Search = { w?: string; b?: string; s?: string; yangi?: string };

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const t = await getT();
  const money = t.money;

  const offset = Number.parseInt(sp.w ?? "0", 10) || 0;
  const base = addDays(new Date(), offset * 7);
  const { from, to } = weekRange(base);

  const canEdit = user.role !== "PARENT";
  // Markazdagi mutaxassis seans yozmaydi — jadvalni qabulxona/rahbar tuzadi.
  // Yakka mutaxassis o'ziga o'zi rahbar, u yozadi.
  const canCreate = canEdit && (user.role !== "SPECIALIST" || isSolo(user));
  // "O'tdi"/"Kelmadi" faqat seans vaqti boshlangach
  const now = new Date();
  const branchFilter =
    user.role === "OWNER" ? (sp.b || null) : user.branchId;
  const specialistFilter =
    user.role === "SPECIALIST" ? user.specialistId : (sp.s || null);

  const [sessions, branches, specialists, clients, sessionTypes, presetService] = await Promise.all([
    prisma.session.findMany({
      where: {
        ...sessionScope(user),
        startsAt: { gte: from, lt: to },
        ...(branchFilter ? { branchId: branchFilter } : {}),
        ...(specialistFilter ? { specialistId: specialistFilter } : {}),
      },
      orderBy: { startsAt: "asc" },
      include: {
        client: { select: { id: true, fullName: true } },
        specialist: { include: { user: { select: { fullName: true } } } },
        branch: { select: { name: true } },
        sessionType: { select: { name: true } },
      },
    }),
    user.role === "OWNER"
      ? prisma.branch.findMany({ where: NOT_SOLO, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    user.role === "PARENT" || user.role === "SPECIALIST"
      ? Promise.resolve([])
      : prisma.specialist.findMany({
          where: { isActive: true, ...(user.branchId ? { branchId: user.branchId } : {}) },
          include: { user: { select: { fullName: true } }, branch: { select: { name: true } } },
          orderBy: { specialization: "asc" },
        }),
    canEdit
      ? prisma.client.findMany({
          where: { ...clientScope(user), status: "ACTIVE" },
          select: { id: true, fullName: true, branch: { select: { name: true } } },
          orderBy: [{ branch: { name: "asc" } }, { fullName: "asc" }],
        })
      : Promise.resolve([]),
    canEdit ? getSessionTypes(user) : Promise.resolve([]),
    // Mijoz kartasidagi "Seans yozish" dan kelinsa — uning xizmati oldindan tanlanadi
    sp.yangi
      ? prisma.clientService.findFirst({
          where: { clientId: sp.yangi, sessionType: { isActive: true } },
          orderBy: { createdAt: "asc" },
          select: { sessionTypeId: true },
        })
      : Promise.resolve(null),
  ]);

  // Mutaxassis o'ziga seans qo'shishi uchun ro'yxat
  const specialistOptions =
    user.role === "SPECIALIST"
      ? [{ id: user.specialistId!, name: `${user.fullName} (${t("men")})`, branchName: "" }]
      : specialists.map((s) => ({
          id: s.id,
          name: `${s.user.fullName} — ${t(specLabel(s.specialization))}`,
          branchName: s.branch.name,
        }));

  // Egasi barcha filiallarni ko'radi: ro'yxatlarni filial bo'yicha guruhlaymiz,
  // shunda turli filialdagi mijoz bilan mutaxassisni adashib tanlab qo'yilmaydi.
  const groupByBranch = <T extends { branchName: string }>(items: T[]) => {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const list = map.get(item.branchName) ?? [];
      list.push(item);
      map.set(item.branchName, list);
    }
    return [...map.entries()];
  };

  const clientOptions = clients.map((c) => ({
    id: c.id,
    name: c.fullName,
    branchName: c.branch.name,
  }));
  const showGroups = user.role === "OWNER";

  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = dateShort(s.startsAt);
    const list = byDay.get(key) ?? [];
    list.push(s);
    byDay.set(key, list);
  }

  const todayKey = dateShort(new Date());
  const qs = (o: number) => {
    const p = new URLSearchParams();
    p.set("w", String(o));
    if (sp.b) p.set("b", sp.b);
    if (sp.s) p.set("s", sp.s);
    return `/schedule?${p.toString()}`;
  };

  const done = sessions.filter((s) => s.status === "DONE").length;
  const planned = sessions.filter((s) => s.status === "PLANNED").length;

  return (
    <>
      <PageHeader
        title={t("Seanslar jadvali")}
        subtitle={`${dateShort(from)} — ${dateShort(addDays(from, 6))} · ${t("{n} ta seans ({done} o'tdi, {planned} rejada)", { n: sessions.length, done, planned })}`}
        action={
          <div className="flex items-center gap-2">
            <Link href={qs(offset - 1)} className={btn}>
              ← {t("O'tgan hafta")}
            </Link>
            {offset !== 0 ? (
              <Link href={qs(0)} className={btn}>
                {t("Bu hafta")}
              </Link>
            ) : null}
            <Link href={qs(offset + 1)} className={btn}>
              {t("Keyingi hafta")} →
            </Link>
          </div>
        }
      />

      {(branches.length > 0 || specialistOptions.length > 1) && user.role !== "PARENT" ? (
        <form method="get" className={`${card} mb-5 flex flex-wrap items-end gap-3 p-4`}>
          <input type="hidden" name="w" value={offset} />
          {branches.length > 0 ? (
            <div className="min-w-[180px]">
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
          ) : null}
          {user.role !== "SPECIALIST" && specialists.length > 0 ? (
            <div className="min-w-[220px]">
              <label className={label} htmlFor="s">
                {t("Mutaxassis")}
              </label>
              <select id="s" name="s" defaultValue={sp.s ?? ""} className={input}>
                <option value="">{t("Barchasi")}</option>
                {specialists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.user.fullName} — {t(specLabel(s.specialization))}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button type="submit" className={btnPrimary}>
            {t("Filtrlash")}
          </button>
        </form>
      ) : null}

      {canCreate && clients.length > 0 ? (
        <details id="yangi" data-autoclose open={Boolean(sp.yangi)} className={`${card} mb-5 p-4`}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
            + {t("Yangi seans qo'shish")}
          </summary>
          <form action={createSession} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <label className={label} htmlFor="clientId">
                {t("Mijoz")}
              </label>
              {/* Mijoz oldindan tanlanmaydi (mijoz kartasidagi "Seans yozish"dan
                  kelgandagina o'sha mijoz tanlangan bo'ladi) — aks holda seans
                  e'tiborsiz birinchi turgan mijozga yozilib ketardi */}
              <select
                id="clientId"
                name="clientId"
                defaultValue={sp.yangi || ""}
                className={input}
                required
              >
                <option value="" disabled>
                  {t("Mijozni tanlang")}
                </option>
                {showGroups
                  ? groupByBranch(clientOptions).map(([branchName, items]) => (
                      <optgroup key={branchName} label={branchName}>
                        {items.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  : clientOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className={label} htmlFor="specialistId">
                {t("Mutaxassis")}
              </label>
              <select
                id="specialistId"
                name="specialistId"
                className={input}
                required
                defaultValue={specialistOptions.length === 1 ? specialistOptions[0].id : ""}
              >
                {specialistOptions.length > 1 ? (
                  <option value="" disabled>
                    {t("Mutaxassisni tanlang")}
                  </option>
                ) : null}
                {showGroups
                  ? groupByBranch(specialistOptions).map(([branchName, items]) => (
                      <optgroup key={branchName} label={branchName}>
                        {items.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  : specialistOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="startsAt">
                {t("Sana va vaqt")}
              </label>
              <DateField id="startsAt" name="startsAt" withTime required />
            </div>
            <div>
              <label className={label} htmlFor="durationMin">
                {t("Davomiyligi (daqiqa)")}
              </label>
              <input
                id="durationMin"
                name="durationMin"
                type="number"
                min={15}
                max={180}
                step={5}
                defaultValue={45}
                className={input}
              />
            </div>
            {sessionTypes.length > 0 ? (
              <div className="lg:col-span-2">
                <label className={label} htmlFor="sessionTypeId">
                  {t("Xizmat")}
                </label>
                {/* Tanlanmasa mijozga biriktirilgan xizmat olinadi */}
                <select
                  id="sessionTypeId"
                  name="sessionTypeId"
                  defaultValue={presetService?.sessionTypeId ?? ""}
                  className={input}
                >
                  <option value="">{t("— mijozning xizmati —")}</option>
                  {sessionTypes.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} · {money(st.price)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-xs text-amber-700 lg:col-span-2 dark:text-amber-400">
                {t("Seans yozish uchun avval Sozlamalarda xizmat qo'shing.")}
              </p>
            )}
            <div>
              <label className={label} htmlFor="note">
                {t("Izoh (ixtiyoriy)")}
              </label>
              <input id="note" name="note" className={input} placeholder={t("masalan: ota-ona bilan")} />
            </div>
            <div className="flex items-end">
              <input type="hidden" name="allowDebt" defaultValue="" />
              <CheckedSubmit check={checkSessionBalance} className={`${btnPrimary} w-full`}>
                {t("Qo'shish")}
              </CheckedSubmit>
            </div>
          </form>
        </details>
      ) : null}

      <div className="space-y-4">
        {days.map((day) => {
          const key = dateShort(day);
          const list = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <Card
              key={key}
              title={`${t.weekday(day)}, ${key}`}
              subtitle={isToday ? t("bugun") : undefined}
              className={isToday ? "ring-2 ring-indigo-500/30" : ""}
            >
              {list.length === 0 ? (
                <Empty>{t("Seans yo'q.")}</Empty>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {list.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="w-14 shrink-0 text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                        {timeUz(s.startsAt)}
                      </div>
                      <div className="min-w-[160px] flex-1">
                        <Link
                          href={`/clients/${s.client.id}`}
                          className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          {s.client.fullName}
                        </Link>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {s.specialist.user.fullName} ·{" "}
                          {t(specLabel(s.specialist.specialization))}
                          {!branchFilter ? ` · ${s.branch.name}` : ""} · {t("{n} daq.", { n: s.durationMin })}
                        </p>
                        {s.sessionType ? (
                          <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                            {s.sessionType.name}
                          </p>
                        ) : null}
                        {s.note ? (
                          <p className="text-xs text-slate-400">{s.note}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={SESSION_STATUS_STYLE[s.status as SessionStatus]}>
                          {t(SESSION_STATUSES[s.status as SessionStatus])}
                        </Badge>
                        {s.price > 0 ? (
                          <span className="text-xs text-slate-400">{money(s.price)}</span>
                        ) : null}
                      </div>

                      {canEdit ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {s.status === "PLANNED" ? (
                            <>
                              {s.startsAt <= now ? (
                                <>
                                  <StatusButton id={s.id} status="DONE" title={t("O'tdi")} tone="good" />
                                  <StatusButton id={s.id} status="NO_SHOW" title={t("Kelmadi")} tone="bad" />
                                </>
                              ) : null}
                              <StatusButton
                                id={s.id}
                                status="CANCELLED_CLIENT"
                                title={t("Bekor")}
                                tone="warn"
                              />
                              <form action={deleteSession}>
                                <input type="hidden" name="sessionId" value={s.id} />
                                <button
                                  type="submit"
                                  className="rounded-md px-2 py-1 text-xs text-slate-400 hover:text-rose-600"
                                  title={t("O'chirish")}
                                >
                                  ✕
                                </button>
                              </form>
                            </>
                          ) : (
                            <StatusButton id={s.id} status="PLANNED" title={t("Qaytarish")} tone="plain" />
                          )}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

function StatusButton({
  id,
  status,
  title,
  tone,
}: {
  id: string;
  status: SessionStatus;
  title: string;
  tone: "good" | "bad" | "warn" | "plain";
}) {
  const tones = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    bad: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
    warn: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
    plain:
      "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  };
  return (
    <form action={setSessionStatus}>
      <input type="hidden" name="sessionId" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={`rounded-md border px-2 py-1 text-xs font-medium transition ${tones[tone]}`}
      >
        {title}
      </button>
    </form>
  );
}
