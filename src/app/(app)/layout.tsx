import { redirect } from "next/navigation";
import { requireUser, isSolo } from "@/lib/auth";
import { ROLES, SPECIALIZATIONS, type Specialization, specLabel } from "@/lib/constants";
import { MobileNav, SideNav, type NavItem } from "@/components/nav";
import { Flash } from "@/components/flash";
import { AutoCloseEdits } from "@/components/auto-close";
import { Install } from "@/components/install";
import { logout } from "@/app/login/actions";
import { BrandMark } from "@/components/brand";
import { I18nProvider } from "@/components/i18n";
import { TopControls } from "@/components/topbar";
import { getSettings } from "@/lib/settings";
import { dictFor } from "@/lib/i18n/dicts";
import { getT } from "@/lib/i18n/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Ota-onaning hamma narsasi Telegram kabinetida (/m). Katta panel, uning
  // sozlamalari va paroli unga kerak emas — u faqat Telegram orqali kiradi.
  if (user.role === "PARENT") redirect("/m");
  const t = await getT();
    const { logoUrl: centerLogo, centerName } = await getSettings();
  // Yakka logoped menyu tepasiga o'z nomi va logotipini qo'yadi (Sozlamalar);
  // qo'ymagan bo'lsa — standart nom va markaz logotipi
  const solo = isSolo(user);
  const brandTitle = solo ? user.brandName || "Logoped CRM" : centerName;
  const logoUrl =
    solo && user.brandLogoAt && user.branchId
      ? `/api/logo?b=${user.branchId}&v=${new Date(user.brandLogoAt).getTime()}`
      : centerLogo;

  const items: NavItem[] = [];
  if (isSolo(user)) {
    // Yakka logoped — o'ziga rahbar: markaz egasining paneli, faqat Xodimlar
    // va Filiallarsiz (unda boshqa xodim ham, boshqa filial ham yo'q).
    // "Pulim" ham kerak emas: pulning hammasi o'ziniki, Hisobotlarda turadi.
    items.push({ href: "/", label: t("Panel"), icon: "home" });
    items.push({ href: "/schedule", label: t("Seanslar jadvali"), icon: "calendar" });
    items.push({ href: "/slots", label: t("Bo'sh vaqtlar"), icon: "clock" });
    items.push({ href: "/intakes", label: t("Konsultatsiya uchun qabullar"), icon: "door" });
    items.push({ href: "/clients", label: t("Mijozlar"), icon: "users" });
    items.push({ href: "/payments", label: t("To'lovlar"), icon: "wallet" });
    items.push({ href: "/reports", label: t("Hisobotlar"), icon: "chart" });
  } else {
    // Mutaxassisning uy sahifasi — telefon kabineti
    if (user.role === "SPECIALIST") {
      items.push({ href: "/m", label: t("Kabinet"), icon: "phone" });
    } else if (user.role !== "RECEPTION") {
      items.push({ href: "/", label: t("Panel"), icon: "home" });
    }
    items.push({ href: "/schedule", label: t("Seanslar jadvali"), icon: "calendar" });
    // Bo'sh vaqtlar: qabulxona xodimi telefonda turib vaqt tanlashi uchun
    if (user.role !== "SPECIALIST") {
      items.push({ href: "/slots", label: t("Bo'sh vaqtlar"), icon: "clock" });
    }
    // Qabul — markazga birinchi marta kelgan odam; mutaxassisga u ko'rinmaydi
    if (user.role !== "SPECIALIST") {
      items.push({ href: "/intakes", label: t("Konsultatsiya uchun qabullar"), icon: "door" });
    }
    items.push({ href: "/clients", label: t("Mijozlar"), icon: "users" });
    if (user.role === "SPECIALIST") {
      items.push({ href: "/earnings", label: t("Pulim"), icon: "wallet" });
    } else if (user.role === "RECEPTION") {
      // Qabulxona xodimiga maosh, xodimlar va hisobotlar ko'rinmaydi
      items.push({ href: "/payments", label: t("To'lovlar"), icon: "wallet" });
    } else {
      items.push({ href: "/specialists", label: t("Xodimlar"), icon: "badge" });
      if (user.role === "OWNER") {
        items.push({ href: "/branches", label: t("Filiallar"), icon: "building" });
      }
      items.push({ href: "/payments", label: t("To'lovlar"), icon: "wallet" });
      items.push({ href: "/reports", label: t("Hisobotlar"), icon: "chart" });
    }
  }

  items.push({ href: "/settings", label: t("Sozlamalar"), icon: "gear" });

  const roleLine =
    user.role === "SPECIALIST" && user.specialization
      ? t(specLabel(user.specialization))
      : t(ROLES[user.role]);

  return (
    <I18nProvider locale={t.locale} dict={dictFor(t.locale)}>
    <div className="min-h-screen lg:flex">
      {/* Yon menyu joyida qotadi — uzun sahifani pastga aylantirganda ham ko'rinib tursin */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <BrandMark logoUrl={logoUrl} />
          <div className="leading-tight">
            <p className="text-sm font-bold text-slate-900 dark:text-white" data-testid="brand-title">{brandTitle}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isSolo(user) ? t("Yakka ishlayman") : (user.branchName ?? t("Barcha filiallar"))}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <SideNav items={items} />
        </div>

      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Til, rejim va foydalanuvchi menyusi — tepa o'ng burchakda: sahifaga
            kirgan odam ularni birinchi qidiradi */}
        <header
          data-testid="topbar"
          className="sticky top-0 z-30 hidden h-16 items-center justify-end border-b border-slate-200/80 bg-white/80 px-8 backdrop-blur lg:flex dark:border-slate-800 dark:bg-slate-900/80"
        >
          <TopControls fullName={user.fullName} roleLine={roleLine} logout={logout} />
        </header>

        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5 lg:hidden dark:border-slate-800 dark:bg-slate-900">
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark logoUrl={logoUrl} size="sm" />
            <div className="hidden min-w-0 leading-tight min-[400px]:block">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{brandTitle}</p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {isSolo(user) ? t("Yakka ishlayman") : (user.branchName ?? t("Barcha filiallar"))}
              </p>
            </div>
          </div>
          <TopControls fullName={user.fullName} roleLine={roleLine} logout={logout} compact />
        </header>

        <MobileNav items={items} />

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {/* Telefonda yon menyu yashiringani uchun o'rnatish taklifi shu yerda ko'rinadi */}
          <Install variant="banner" className="mb-5 lg:hidden" />
          {children}
        </main>
      </div>

      <Flash />
      <AutoCloseEdits />
    </div>
    </I18nProvider>
  );
}
