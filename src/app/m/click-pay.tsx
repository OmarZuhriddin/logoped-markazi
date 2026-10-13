"use client";

import { useState, useTransition } from "react";
import { useT } from "@/components/i18n";
import { startClickPayment } from "./parent-actions";

type TgWebApp = { openLink?: (url: string) => void };

/**
 * "Click orqali to'lash": summa yoziladi, Click sahifasi ochiladi.
 *
 * Telegram ichida havola tizim brauzerida (yoki Click ilovasida) ochiladi —
 * Mini App oynasi o'rnida emas, shunda ota-ona to'lovdan keyin kabinetga
 * qaytib, sahifani yangilaydi. Qoldiq to'lov Click tasdiqlagandan keyingina o'zgaradi.
 */
export function ClickPay({ clientId, suggested }: { clientId: string; suggested: number }) {
  const t = useT();
  const [amount, setAmount] = useState(suggested > 0 ? String(suggested) : "");
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [pending, start] = useTransition();

  function pay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("amount", amount);
    start(async () => {
      const res = await startClickPayment(fd);
      if (res.error || !res.url) {
        setError(res.error ?? t("Amal bajarilmadi. Qaytadan urinib ko'ring."));
        return;
      }
      const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
      if (tg?.openLink) tg.openLink(res.url);
      else window.open(res.url, "_blank", "noopener");
      setOpened(true);
    });
  }

  return (
    <form onSubmit={pay} className="app-card mb-2 space-y-2 p-3" data-testid="click-pay">
      <p className="text-sm font-semibold">{t("Click orqali to'lash")}</p>
      <p className="text-xs app-muted">{t("Uzcard yoki Humo kartasi bilan to'lang.")}</p>
      <div className="flex gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
          inputMode="numeric"
          placeholder={t("summa")}
          aria-label={t("Summa")}
          className="min-w-0 flex-1 rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm tabular-nums"
        />
        <button
          type="submit"
          disabled={pending || !amount}
          className="app-accent shrink-0 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {t("To'lash")}
        </button>
      </div>
      {suggested > 0 ? (
        <button
          type="button"
          onClick={() => setAmount(String(suggested))}
          className="text-xs font-medium underline app-muted"
        >
          {t("Qarzni to'lash: {sum}", { sum: t.money(suggested) })}
        </button>
      ) : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      {opened ? (
        <p className="text-xs app-muted">
          {t("To'lovdan keyin shu sahifaga qaytib, uni yangilang — to'lov Click tasdiqlagach ko'rinadi.")}
        </p>
      ) : null}
    </form>
  );
}
