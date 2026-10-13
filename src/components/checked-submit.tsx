"use client";

import { useRef, type ReactNode } from "react";

/**
 * Yuborish tugmasi: forma ketishidan oldin serverdan so'raydi, ogohlantirish
 * bo'lsa foydalanuvchidan tasdiq oladi va tasdiqlansa formaga `allowDebt=1`
 * qo'shib yuboradi.
 *
 * Nega tugma, forma emas: seans formalari serverda chiziladi va ikki joyda
 * (Jadval, Bo'sh vaqtlar) turadi — ularni qayta yozmasdan faqat tugmani
 * almashtirish yetadi. Forma ichida `<input type="hidden" name="allowDebt">`
 * turishi kerak. JavaScript o'chiq bo'lsa tugma oddiy ishlaydi, serverning
 * o'zi pul yetmasa rad etadi.
 */
export function CheckedSubmit({
  check,
  className,
  children,
}: {
  check: (data: FormData) => Promise<{ message: string | null }>;
  className?: string;
  children: ReactNode;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);

  async function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    const form = btn.current?.form;
    if (!form) return;
    e.preventDefault();
    if (busy.current || !form.reportValidity()) return;
    busy.current = true;
    try {
      const flag = form.elements.namedItem("allowDebt") as HTMLInputElement | null;
      if (flag) flag.value = "";
      const { message } = await check(new FormData(form));
      if (message) {
        if (!window.confirm(message)) return;
        if (flag) flag.value = "1";
      }
      form.requestSubmit();
    } finally {
      busy.current = false;
    }
  }

  return (
    <button ref={btn} type="submit" className={className} onClick={onClick}>
      {children}
    </button>
  );
}
