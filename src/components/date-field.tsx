"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { input } from "@/components/ui";
import { useT } from "@/components/i18n";

const pad = (n: number) => String(n).padStart(2, "0");

/** 2020-05-05 -> 05.05.2020, 2026-03-14T09:30 -> 14.03.2026 09:30 */
function toDisplay(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(v);
  if (!m) return v;
  return `${m[3]}.${m[2]}.${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
}

/** Matndan kun/oy/yil (va vaqt) ni oladi; ISO ham, kun.oy.yil ham tushuniladi */
function parse(v: string) {
  const s = toDisplay(v.trim());
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?: (\d{1,2}):(\d{2}))?$/.exec(s);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(y, mo - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== d) return null;
  return { y, m: mo - 1, d, h: m[4] ? Number(m[4]) : 0, min: m[5] ? Number(m[5]) : 0 };
}

/** Faqat raqam yozilganda nuqta, bo'shliq va ikki nuqtani o'zi qo'yadi */
function mask(raw: string, withTime: boolean): string {
  const digits = raw.replace(/\D/g, "").slice(0, withTime ? 12 : 8);
  const date = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join(".");
  if (!withTime || digits.length <= 8) return date;
  const time = [digits.slice(8, 10), digits.slice(10, 12)].filter(Boolean).join(":");
  return `${date} ${time}`;
}

/**
 * Kun.oy.yil ko'rinishidagi sana (va ixtiyoriy vaqt) maydoni, kalendar bilan.
 *
 * `type="date"` ni brauzer o'z tilida (ko'pincha oy/kun/yil) ko'rsatadi va
 * buni sahifadan o'zgartirib bo'lmaydi, shuning uchun oddiy matn maydoni:
 * qo'lda yozsa nuqtalar o'zi qo'yiladi, kalendar tugmasi esa oynani ochadi.
 * Kalendarda tanlangan sana «OK» bosilgandagina maydonga tushadi.
 * Serverga ISO (2020-05-05) ham, kun.oy.yil ham ketishi mumkin —
 * `parseDateInput` ikkalasini tushunadi.
 */
export function DateField({
  name,
  id,
  defaultValue = "",
  required,
  withTime = false,
}: {
  name: string;
  id?: string;
  defaultValue?: string;
  required?: boolean;
  withTime?: boolean;
}) {
  const t = useT();
  const [value, setValue] = useState(toDisplay(defaultValue));
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: 2000, m: 0 });
  const [pick, setPick] = useState<{ y: number; m: number; d: number } | null>(null);
  const [time, setTime] = useState({ h: 9, min: 0 });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function openCalendar() {
    const cur = parse(value);
    const now = new Date();
    const base = cur ?? { y: now.getFullYear(), m: now.getMonth(), d: now.getDate(), h: 9, min: 0 };
    setView({ y: base.y, m: base.m });
    setPick(cur ? { y: cur.y, m: cur.m, d: cur.d } : null);
    setTime({ h: cur ? cur.h : withTime ? now.getHours() : 9, min: cur ? cur.min : 0 });
    setOpen(true);
  }

  function confirm() {
    if (!pick) return setOpen(false);
    const date = `${pad(pick.d)}.${pad(pick.m + 1)}.${pick.y}`;
    setValue(withTime ? `${date} ${pad(time.h)}:${pad(time.min)}` : date);
    setOpen(false);
  }

  function shift(delta: number) {
    const x = new Date(view.y, view.m + delta, 1);
    setView({ y: x.getFullYear(), m: x.getMonth() });
  }

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const lead = (first.getDay() + 6) % 7; // hafta dushanbadan boshlanadi
    const days = new Date(view.y, view.m + 1, 0).getDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [view]);

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 111 }, (_, i) => thisYear + 10 - i);
  if (!years.includes(view.y)) years.push(view.y);
  const today = new Date();
  const sel = "rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950";

  return (
    <div ref={box} className="relative">
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value.includes("-") ? e.target.value : mask(e.target.value, withTime))}
        inputMode="numeric"
        placeholder={withTime ? "KK.OO.YYYY SS:DD" : "KK.OO.YYYY"}
        pattern={
          withTime
            ? "(\\d{2}\\.\\d{2}\\.\\d{4} \\d{2}:\\d{2})|(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2})"
            : "(\\d{2}\\.\\d{2}\\.\\d{4})|(\\d{4}-\\d{2}-\\d{2})"
        }
        maxLength={withTime ? 16 : 10}
        autoComplete="off"
        className={`${input} pr-10`}
        required={required}
      />
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openCalendar())}
        aria-label={t("Sanani tanlash")}
        title={t("Sanani tanlash")}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-indigo-600 dark:text-slate-400"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M8 3v4M16 3v4M3.5 10h17" />
        </svg>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t("Sanani tanlash")}
          className="absolute left-0 z-50 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <div className="mb-2 flex items-center gap-1.5">
            <button type="button" onClick={() => shift(-1)} aria-label={t("O'tgan oy")} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              ‹
            </button>
            <select
              value={view.m}
              onChange={(e) => setView({ ...view, m: Number(e.target.value) })}
              className={`${sel} flex-1`}
              aria-label={t("Oy")}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>
                  {t.month(i)}
                </option>
              ))}
            </select>
            <select
              value={view.y}
              onChange={(e) => setView({ ...view, y: Number(e.target.value) })}
              className={sel}
              aria-label={t("Yil")}
            >
              {years
                .sort((a, b) => b - a)
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </select>
            <button type="button" onClick={() => shift(1)} aria-label={t("Keyingi oy")} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="py-1 font-semibold text-slate-400">
                {t.weekdayShort(new Date(2024, 0, 1 + i))}
              </div>
            ))}
            {cells.map((d, i) =>
              d === null ? (
                <div key={`e${i}`} />
              ) : (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPick({ y: view.y, m: view.m, d })}
                  className={
                    "rounded-lg py-1.5 text-sm " +
                    (pick && pick.y === view.y && pick.m === view.m && pick.d === d
                      ? "bg-indigo-600 font-semibold text-white"
                      : today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d
                        ? "font-semibold text-indigo-600 ring-1 ring-indigo-300 hover:bg-slate-100 dark:text-indigo-400 dark:hover:bg-slate-800"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800")
                  }
                >
                  {d}
                </button>
              ),
            )}
          </div>

          {withTime ? (
            <div className="mt-2 flex items-center gap-1.5 text-sm">
              <span className="text-slate-500 dark:text-slate-400">{t("Vaqt")}</span>
              <select value={time.h} onChange={(e) => setTime({ ...time, h: Number(e.target.value) })} className={sel} aria-label={t("Soat")}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {pad(h)}
                  </option>
                ))}
              </select>
              :
              <select value={time.min} onChange={(e) => setTime({ ...time, min: Number(e.target.value) })} className={sel} aria-label={t("Daqiqa")}>
                {Array.from({ length: 60 }, (_, m) => (
                  <option key={m} value={m}>
                    {pad(m)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              {t("Bekor")}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!pick}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {t("OK")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
