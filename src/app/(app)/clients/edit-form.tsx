import { DateField } from "@/components/date-field";
import { toDateInput } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { btnPrimary, input, label } from "@/components/ui";
import { updateClient } from "./actions";

export type EditableClient = {
  id: string;
  fullName: string;
  birthDate: Date;
  gender: string | null;
  branchId: string;
  parentName: string;
  parentPhone: string;
  diagnosis: string | null;
  note: string | null;
};

/**
 * Mijoz ma'lumotini tahrirlash formasi.
 *
 * Mijozlar ro'yxatida ham, mijoz kartasida ham aynan shu forma turadi —
 * ikki joyda alohida yozilsa, biriga maydon qo'shilib ikkinchisi esdan
 * chiqib qolardi. Filial ro'yxati faqat egaga beriladi (bo'sh bo'lsa
 * filial maydoni ko'rinmaydi, server ham boshqa rolga filialni
 * o'zgartirtirmaydi).
 */
export async function ClientEditForm({
  client,
  branches,
  columns = "sm:grid-cols-2",
}: {
  client: EditableClient;
  branches: { id: string; name: string }[];
  columns?: string;
}) {
  const t = await getT();
  return (
    <form action={updateClient} className={`grid gap-3 ${columns}`} data-testid="client-edit-form">
      <input type="hidden" name="clientId" value={client.id} />
      <div>
        <label className={label}>{t("Bolaning F.I.Sh.")} *</label>
        <input name="fullName" defaultValue={client.fullName} className={input} required />
      </div>
      <div>
        <label className={label}>{t("Tug'ilgan sana")} *</label>
        <DateField name="birthDate" defaultValue={toDateInput(client.birthDate)} required />
      </div>
      <div>
        <label className={label}>{t("Jinsi")}</label>
        <select name="gender" defaultValue={client.gender ?? ""} className={input}>
          <option value="">{t("Ko'rsatilmagan")}</option>
          <option value="M">{t("O'g'il bola")}</option>
          <option value="F">{t("Qiz bola")}</option>
        </select>
      </div>
      {branches.length > 0 ? (
        <div>
          <label className={label}>{t("Filial")}</label>
          <select name="branchId" defaultValue={client.branchId} className={input}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div>
        <label className={label}>{t("Ota-ona F.I.Sh.")} *</label>
        <input name="parentName" defaultValue={client.parentName} className={input} required />
      </div>
      <div>
        <label className={label}>{t("Ota-ona telefoni")} *</label>
        <input
          name="parentPhone"
          type="tel"
          defaultValue={client.parentPhone}
          className={input}
          required
        />
      </div>
      <div>
        <label className={label}>{t("Tashxis / shikoyat")}</label>
        <input name="diagnosis" defaultValue={client.diagnosis ?? ""} className={input} />
      </div>
      <div>
        <label className={label}>{t("Izoh")}</label>
        <input name="note" defaultValue={client.note ?? ""} className={input} />
      </div>
      <div className="col-span-full">
        <button type="submit" className={btnPrimary}>
          {t("Saqlash")}
        </button>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {t("Telefon raqamni o'zgartirsangiz, eslatmalar yangi raqamga boradi. Ota-ona Telegram'ga qaytadan ulanishi kerak bo'ladi.")}
        </p>
      </div>
    </form>
  );
}
