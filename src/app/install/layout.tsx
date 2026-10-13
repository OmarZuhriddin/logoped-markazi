import { I18nProvider } from "@/components/i18n";
import { dictFor } from "@/lib/i18n/dicts";
import { getLocale } from "@/lib/i18n/server";

/**
 * Bu sahifa tun/kun tanlovidan qat'i nazar doim kunduzgi rejimda ochiladi:
 * u foydalanuvchi kirmasdan oldingi birinchi ekran, tungi rangda esa
 * o'rnatish yo'riqnomasi ko'zga yomon tashlanadi. Asosiy layout'dagi
 * skript `dark` klassini qo'yadi, bu skript esa undan keyin, birinchi
 * chizishdan oldin uni olib tashlaydi (rang chaqnamasligi uchun).
 */
const FORCE_LIGHT = `(function(){var d=document.documentElement;d.classList.remove("dark");d.style.colorScheme="light";var k=document.querySelector('meta[name="theme-color"]');if(k)k.setAttribute("content","#effbf6")})()`;

/**
 * O'rnatish yo'riqnomasi kirishsiz ochiladi — tilni cookie'dan olamiz.
 *
 * Cookie o'qilgani uchun bu sahifa statik emas, har so'rovda serverda
 * chiziladi. Ataylab shunday: muqobili — uchala lug'atni brauzerga yuborish
 * (~70 KB) edi, bu esa statik sahifadan qimmatroq tushardi.
 */
export default async function InstallLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale} dict={dictFor(locale)}>
      <script dangerouslySetInnerHTML={{ __html: FORCE_LIGHT }} />
      {children}
    </I18nProvider>
  );
}
