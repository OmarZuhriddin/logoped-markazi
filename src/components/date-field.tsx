"use client";

import { useState } from "react";
import { input } from "@/components/ui";

/** 2020-05-05 -> 05.05.2020 */
function toDisplay(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
}

/**
 * Kun.oy.yil ko'rinishidagi sana maydoni.
 *
 * `type="date"` ni brauzer o'z tilida (ko'pincha oy/kun/yil) ko'rsatadi va
 * buni sahifadan o'zgartirib bo'lmaydi, shuning uchun oddiy matn maydoni:
 * raqam yozilganda nuqtalar o'zi qo'yiladi. Serverga ISO (2020-05-05) ham,
 * kun.oy.yil ham ketishi mumkin — `parseDateInput` ikkalasini tushunadi.
 */
export function DateField({
  name,
  id,
  defaultValue = "",
  required,
}: {
  name: string;
  id?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(toDisplay(defaultValue));

  function onChange(raw: string) {
    // ISO yoki boshqa shaklda yozilgan/qo'yilgan matnga tegmaymiz
    if (raw.includes("-")) return setValue(raw);
    const d = raw.replace(/\D/g, "").slice(0, 8);
    const parts = [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean);
    setValue(parts.join("."));
  }

  return (
    <input
      id={id}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputMode="numeric"
      placeholder="KK.OO.YYYY"
      pattern="(\d{2}\.\d{2}\.\d{4})|(\d{4}-\d{2}-\d{2})"
      maxLength={10}
      autoComplete="off"
      className={input}
      required={required}
    />
  );
}
