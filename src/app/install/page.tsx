"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/i18n";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallPage() {
  const t = useT();
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");

  // Ilova ichidan havola orqali kirilganda layout skripti qayta ishlamaydi,
  // shuning uchun kunduzgi rejim bu yerda ham qo'yiladi; chiqishda tanlangan
  // rejim qaytariladi.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    root.style.colorScheme = "light";
    return () => {
      if (wasDark) root.classList.add("dark");
      root.style.colorScheme = wasDark ? "dark" : "light";
    };
  }, []);

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) setPlatform("ios");
    else if (/Android/i.test(ua)) setPlatform("android");

    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="h-12 w-12 rounded-xl" />
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Logoped</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("Telefon bosh ekraniga o'rnatish")}
            </p>
          </div>
        </div>

        {installed ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            {t("Ilova allaqachon o'rnatilgan — bosh ekrandagi ikonkadan oching.")}
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {t("O'rnatilganda telefoningizda alohida ikonka paydo bo'ladi va brauzer satrisiz, to'liq ekranda ochiladi. Hech narsa yuklab olish shart emas.")}
            </p>

            {prompt ? (
              <button
                type="button"
                onClick={async () => {
                  await prompt.prompt();
                  const choice = await prompt.userChoice;
                  if (choice.outcome === "accepted") setInstalled(true);
                  setPrompt(null);
                }}
                className="mb-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                {t("Ilovani o'rnatish")}
              </button>
            ) : null}

            {platform === "ios" ? (
              <Steps
                title={t("iPhone / iPad (Safari)")}
                steps={[
                  t("Pastdagi «Ulashish» tugmasini bosing (yuqoriga strelkali kvadrat)"),
                  t("Ro'yxatni pastga aylantirib «Bosh ekranga qo'shish» ni tanlang"),
                  t("O'ng yuqoridagi «Qo'shish» ni bosing"),
                ]}
                note={t("Chrome emas, aynan Safari'da ochilishi kerak.")}
              />
            ) : platform === "android" ? (
              <Steps
                title={t("Android (Chrome)")}
                steps={[
                  t("O'ng yuqoridagi uch nuqtani bosing"),
                  t("«Ilovani o'rnatish» yoki «Bosh ekranga qo'shish» ni tanlang"),
                  t("«O'rnatish» ni bosing"),
                ]}
              />
            ) : (
              <Steps
                title={t("Kompyuter (Chrome / Edge)")}
                steps={[
                  t("Manzil satrining o'ng chetidagi o'rnatish belgisini bosing"),
                  t("«O'rnatish» ni tasdiqlang"),
                ]}
              />
            )}
          </>
        )}

        <a
          href="/"
          className="mt-5 block text-center text-sm font-semibold text-indigo-600 dark:text-indigo-400"
        >
          {t("Kabinetga o'tish")} →
        </a>
      </div>
    </main>
  );
}

function Steps({
  title,
  steps,
  note,
}: {
  title: string;
  steps: string[];
  note?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-950">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </p>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-2.5 text-sm text-slate-700 dark:text-slate-300">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      {note ? <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{note}</p> : null}
    </div>
  );
}
