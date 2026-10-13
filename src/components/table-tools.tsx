"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/components/i18n";

type Group = { main: HTMLTableRowElement; extra: HTMLTableRowElement[]; index: number };

/** "1 500 000 so'm" -> 1500000; raqam bo'lmasa null */
function numberOf(text: string): number | null {
  const s = text.replace(/[\s ]/g, "");
  const m = /^[+-]?\d+(?:[.,]\d+)?/.exec(s);
  if (!m) return null;
  // "12.10.2026" kabi sana raqam emas
  if (/^\d+\.\d+\./.test(s)) return null;
  // "+998 90..." kabi telefon ham raqam emas: boshida + bo'lsa matn deb olamiz
  if (s.startsWith("+")) return null;
  const rest = s.slice(m[0].length);
  if (/\d/.test(rest)) return null;
  return Number(m[0].replace(",", "."));
}

/**
 * Serverda chizilgan jadvalga qidiruv va ustun bo'yicha tartiblash qo'shadi.
 *
 * Jadval kataklarida havola, forma va "Tahrirlash" bo'limlari bor, ularni
 * qayta chizib o'tirmaymiz: tayyor jadval DOM'da o'zgartiriladi — qidirilganda
 * qatorlar yashiriladi, ustun sarlavhasi bosilganda qatorlar o'rnini almashtiradi.
 * Qatorning tagidagi bitta katakli qator (tahrirlash bo'limi) o'z qatori bilan
 * bir butun sifatida suriladi.
 *
 * Tartiblash: birinchi bosish — o'sish, ikkinchi — kamayish, uchinchi — asl
 * tartib. Sarlavhadagi belgi `globals.css` da `data-sort` bo'yicha chiziladi
 * (React'ga tegishli sarlavha ichiga qo'shimcha element qo'ymaslik uchun).
 * Server amalidan keyin jadval qayta chizilsa, tanlangan tartib va qidiruv
 * qaytadan qo'llanadi.
 */
export function TableTools({ children }: { children: ReactNode }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [counts, setCounts] = useState({ total: 0, shown: 0 });
  const original = useRef<Group[] | null>(null);
  const busy = useRef(false);

  // Qator guruhlari: asosiy qator + uning tagidagi bitta katakli qatorlar
  function collect(table: HTMLTableElement): Group[] {
    const body = table.tBodies[0];
    if (!body) return [];
    const groups: Group[] = [];
    for (const tr of Array.from(body.rows)) {
      const single = tr.cells.length === 1 && tr.cells[0].colSpan > 1;
      if (single && groups.length) groups[groups.length - 1].extra.push(tr);
      else if (!single) groups.push({ main: tr, extra: [], index: groups.length });
    }
    return groups;
  }

  function apply() {
    const table = box.current?.querySelector("table");
    if (!table || !table.tBodies[0]) return;
    busy.current = true;
    try {
      const groups = collect(table);
      // Asl tartib: qatorlar birinchi marta ko'rilgan tartibda eslab qolinadi
      if (!original.current) original.current = groups.map((g) => ({ ...g }));
      const order = new Map(original.current.map((g, i) => [g.main, i]));
      groups.forEach((g) => (g.index = order.get(g.main) ?? 1e9 + g.index));

      const q = query.trim().toLocaleLowerCase();
      let shown = 0;
      for (const g of groups) {
        const hit = !q || (g.main.textContent ?? "").toLocaleLowerCase().includes(q);
        g.main.hidden = !hit;
        g.extra.forEach((r) => (r.hidden = !hit));
        if (hit) shown++;
      }

      const sorted = [...groups];
      if (sort) {
        const cell = (g: Group) => {
          const c = g.main.cells[sort.col];
          return c ? (c.dataset.sort ?? c.textContent ?? "").trim() : "";
        };
        sorted.sort((a, b) => {
          const x = cell(a);
          const y = cell(b);
          if (!x && !y) return 0;
          if (!x) return 1;
          if (!y) return -1;
          const nx = numberOf(x);
          const ny = numberOf(y);
          const r =
            nx !== null && ny !== null ? nx - ny : x.localeCompare(y, t.locale, { numeric: true });
          return r * sort.dir;
        });
      } else {
        sorted.sort((a, b) => a.index - b.index);
      }
      const body = table.tBodies[0];
      const moved = sorted.some((g, i) => groups[i] !== g);
      if (moved) for (const g of sorted) body.append(g.main, ...g.extra);

      table.querySelectorAll<HTMLElement>("thead th").forEach((th, i) => {
        if (sort && sort.col === i) {
          th.dataset.sort = sort.dir === 1 ? "asc" : "desc";
          th.setAttribute("aria-sort", sort.dir === 1 ? "ascending" : "descending");
        } else {
          delete th.dataset.sort;
          th.removeAttribute("aria-sort");
        }
      });
      setCounts((c) => (c.total === groups.length && c.shown === shown ? c : { total: groups.length, shown }));
    } finally {
      // Kuzatuvchi o'z o'zgarishimizni ko'rib qayta ishga tushmasligi uchun
      // bayroqni keyingi mikro-vazifada tushiramiz
      queueMicrotask(() => (busy.current = false));
    }
  }

  // Sarlavhalarni bosiladigan qilib belgilaymiz
  useEffect(() => {
    const table = box.current?.querySelector("table");
    if (!table) return;
    const heads = Array.from(table.querySelectorAll<HTMLElement>("thead th"));
    const handlers = heads.map((th, i) => {
      if (!(th.textContent ?? "").trim()) return null;
      th.dataset.sortable = "1";
      th.title = t("Tartiblash");
      const on = () =>
        setSort((s) => (!s || s.col !== i ? { col: i, dir: 1 } : s.dir === 1 ? { col: i, dir: -1 } : null));
      th.addEventListener("click", on);
      return [th, on] as const;
    });
    return () =>
      handlers.forEach((h) => {
        if (!h) return;
        h[0].removeEventListener("click", h[1]);
        delete h[0].dataset.sortable;
      });
  }, [t]);

  useEffect(apply);

  // Jadval serverdan qayta chizilsa (qator qo'shildi/o'zgardi) — qaytadan qo'llaymiz
  useEffect(() => {
    const body = box.current?.querySelector("tbody");
    if (!body) return;
    const obs = new MutationObserver(() => {
      if (!busy.current) {
        original.current = null;
        apply();
      }
    });
    obs.observe(body, { childList: true });
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sort]);

  return (
    <div>
      {counts.total > 1 ? (
        <div className="border-b border-slate-200 px-4 py-2 dark:border-slate-800">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Qidirish…")}
            aria-label={t("Jadvaldan qidirish")}
            className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          />
        </div>
      ) : null}
      <div ref={box} className="scroll-x">
        {children}
      </div>
      {query.trim() && counts.shown === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t("Hech narsa topilmadi.")}
        </p>
      ) : null}
    </div>
  );
}
