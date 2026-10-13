import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { btnPrimary, card, input, label } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { BrandMark } from "@/components/brand";
import { Flash } from "@/components/flash";
import { I18nProvider } from "@/components/i18n";
import { LanguageSwitcher, ThemeToggle } from "@/components/prefs";
import { SPECIALIZATIONS, SPECIALIZATION_KEYS, type Specialization, specLabel } from "@/lib/constants";
import { getSettings } from "@/lib/settings";
import { dictFor } from "@/lib/i18n/dicts";
import { getT } from "@/lib/i18n/server";
import { registerSolo } from "./actions";

/**
 * Yakka ishlaydigan mutaxassis uchun ro'yxatdan o'tish.
 *
 * Markazda ishlaydiganga bu sahifa kerak emas — unga akkauntni markaz
 * beradi. Taklif kodi sozlanmagan bo'lsa sahifa umuman ochilmaydi.
 */
export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const t = await getT();
  const { logoUrl, defaultPrice, soloInviteCode } = await getSettings();
  if (!soloInviteCode?.trim()) redirect("/login");

  return (
    <I18nProvider locale={t.locale} dict={dictFor(t.locale)}>
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-between">
            <LanguageSwitcher />
            <ThemeToggle className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" />
          </div>

          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex w-fit">
              <BrandMark logoUrl={logoUrl} size="lg" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              {t("Yakka mutaxassis sifatida ro'yxatdan o'tish")}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t("Mijozlaringiz, jadvalingiz va pulingiz faqat sizga ko'rinadi.")}
            </p>
          </div>

          <Flash />

          <form action={registerSolo} className={`${card} space-y-4 p-5`}>
            <div>
              <label className={label} htmlFor="inviteCode">
                {t("Taklif kodi")} *
              </label>
              <input id="inviteCode" name="inviteCode" className={input} required />
            </div>

            <div>
              <label className={label} htmlFor="fullName">
                {t("F.I.Sh.")} *
              </label>
              <input id="fullName" name="fullName" className={input} required />
            </div>

            <div>
              <label className={label} htmlFor="phone">
                {t("Telefon raqam")} *
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="username"
                placeholder="+998901234567"
                className={input}
                required
              />
            </div>

            <div>
              <label className={label} htmlFor="specialization">
                {t("Yo'nalish")} *
              </label>
              <select id="specialization" name="specialization" className={input} required>
                {SPECIALIZATION_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(specLabel(k))}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={label} htmlFor="price">
                {t("Bitta seans narxi (so'm)")}
              </label>
              <input
                id="price"
                name="price"
                inputMode="numeric"
                defaultValue={defaultPrice}
                className={input}
              />
            </div>

            <div>
              <label className={label} htmlFor="password">
                {t("Parol (kamida 5 belgi)")} *
              </label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
                required
              />
            </div>

            <button type="submit" className={`${btnPrimary} w-full`}>
              {t("Ro'yxatdan o'tish")}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
            {t("Markazda ishlaysizmi?")}{" "}
            <Link
              href="/login"
              className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {t("Kirish")}
            </Link>
          </p>
        </div>
      </main>
    </I18nProvider>
  );
}
