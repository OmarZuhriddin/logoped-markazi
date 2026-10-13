/**
 * Click to'lov manzilini (`/api/click`) tekshiradi: imzo, summa, Prepare,
 * Complete va takroriy Complete.
 *
 * Ishga tushirish (server ishlab turgan va ikkala tomonda ham bir xil
 * CLICK_* qiymatlari bilan):
 *   node tests/click.mjs
 * CLICK_SERVICE_ID, CLICK_MERCHANT_ID, CLICK_SECRET_KEY .env da bo'lmasa o'tkazib yuboriladi.
 */
import { createHash } from "node:crypto";
import { all, closeDb, count, one } from "./db.mjs";
import "dotenv/config";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SERVICE = process.env.CLICK_SERVICE_ID;
const SECRET = process.env.CLICK_SECRET_KEY;

if (!SERVICE || !process.env.CLICK_MERCHANT_ID || !SECRET) {
  console.log("CLICK_* sozlanmagan — Click tekshiruvi o'tkazib yuborildi.");
  await closeDb();
  process.exit(0);
}

const ok = [];
const fails = [];
const check = (name, cond, extra = "") =>
  (cond ? ok : fails).push(`${name}${extra ? ` — ${extra}` : ""}`);

const md5 = (s) => createHash("md5").update(s).digest("hex");

async function click(fields) {
  const p = {
    click_trans_id: "9000001",
    service_id: SERVICE,
    click_paydoc_id: "1",
    sign_time: "2026-10-12 12:00:00",
    error: "0",
    error_note: "Success",
    ...fields,
  };
  if (!p.sign_string) {
    p.sign_string = md5(
      p.click_trans_id + p.service_id + SECRET + p.merchant_trans_id +
        (p.action === "1" ? p.merchant_prepare_id : "") + p.amount + p.action + p.sign_time,
    );
  }
  const res = await fetch(`${BASE}/api/click`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(p).toString(),
  });
  return res.json();
}

const client = await one(
  "SELECT c.id, c.branchId FROM Client c JOIN Branch b ON b.id = c.branchId WHERE b.isSolo = false LIMIT 1",
);
const tx = await one(
  "INSERT INTO ClickTransaction (clientId, branchId, amount, status, updatedAt) VALUES (?, ?, 5000, 'PENDING', now()) RETURNING id",
  client.id, client.branchId,
);
const id = String(tx.id);
const base = { merchant_trans_id: id, amount: "5000.00" };

try {
  check("Noto'g'ri imzo rad etiladi (-1)", (await click({ ...base, action: "0", sign_string: "x".repeat(32) })).error === -1);
  check("Mavjud bo'lmagan to'lov topilmaydi (-5)", (await click({ merchant_trans_id: "99999999", amount: "5000", action: "0" })).error === -5);
  check("Noto'g'ri summa rad etiladi (-2)", (await click({ ...base, amount: "4000.00", action: "0" })).error === -2);

  const prep = await click({ ...base, action: "0" });
  check("Prepare qabul qilinadi va merchant_prepare_id qaytadi", prep.error === 0 && String(prep.merchant_prepare_id) === id, JSON.stringify(prep));

  check(
    "Prepare'dan keyin pul hali yozilmagan",
    (await count("SELECT COUNT(*) AS n FROM Payment WHERE note = 'Click #9000001'")) === 0,
  );
  check("Noto'g'ri merchant_prepare_id rad etiladi (-6)", (await click({ ...base, action: "1", merchant_prepare_id: "123456" })).error === -6);

  const done = await click({ ...base, action: "1", merchant_prepare_id: id });
  check("Complete qabul qilinadi", done.error === 0, JSON.stringify(done));
  const paid = await one("SELECT amount, method, clientId FROM Payment WHERE note = 'Click #9000001'");
  check(
    "Complete'dan keyin Click to'lovi mijozga yoziladi",
    paid && Number(paid.amount) === 5000 && paid.method === "CLICK" && paid.clientId === client.id,
  );

  const again = await click({ ...base, action: "1", merchant_prepare_id: id });
  check("Takroriy Complete rad etiladi (-4)", again.error === -4);
  check(
    "Takroriy Complete ikkinchi to'lov yozmaydi",
    (await count("SELECT COUNT(*) AS n FROM Payment WHERE note = 'Click #9000001'")) === 1,
  );
} finally {
  await all("DELETE FROM Payment WHERE note = 'Click #9000001'");
  await all("DELETE FROM ClickTransaction WHERE id = ?", tx.id);
  await closeDb();
}

console.log(`\n✔ ${ok.length} ta o'tdi`);
for (const f of fails) console.log(`✘ ${f}`);
console.log(`\nNatija: ${ok.length} o'tdi, ${fails.length} xato`);
process.exit(fails.length ? 1 : 0);
