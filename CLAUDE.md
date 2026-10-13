@AGENTS.md

# Logopedik markaz CRM

Logopedik markazlar uchun boshqaruv tizimi: filiallar, mutaxassislar, mijozlar,
jadval, davomat, abonement, to'lov va ish haqi. Ishlab turgan mahsulot — haqiqiy
markaz ishlatadi, demo emas.

Batafsil tavsif `README.md` da, serverga chiqarish `DEPLOY.md` da.

## Til

**Foydalanuvchi ko'radigan hamma matn o'zbekcha** (lotin alifbosida). Kod ichidagi
izohlar ham o'zbekcha — mavjud fayllarga qarab uslubni saqlang. O'zgaruvchi va
funksiya nomlari inglizcha.

Interfeysni inglizcha va ruschaga ham o'tkazish mumkin (`src/lib/i18n/`). Matn
kodda baribir **o'zbekcha** yoziladi, faqat `t()` ga o'raladi — kalit sifatida
o'zbekcha matnning o'zi ishlatiladi:

```tsx
const t = await getT();          // server komponent / action ichida
const t = useT();                // "use client" komponentida
t("Mijozlar")                    // -> "Clients" / "Клиенты"
t("{n} ta seans", { n: 5 })      // o'zgaruvchi qismlar {..} bilan, satrni bo'lib yozmang
t.money(150000)                  // "150 000 so'm" / "150 000 UZS" / "150 000 сум"
t.date(d), t.weekday(d), t.age(birthDate)
```

Yangi matn qo'shsangiz, uning tarjimasini `en.ts` va `ru.ts` ga ham yozing —
`tests/prefs.mjs` buni tekshiradi. Tarjima topilmasa o'zbekchasi ko'rinadi,
sahifa buzilmaydi. `setFlash` va `throw new Error("...")` xabarlari
`setFlash` ichida avtomatik tarjima qilinadi — ularning matni ham lug'atda
bo'lsin. Telegram bot va SMS xabarlari hozircha faqat o'zbekcha (oluvchining
tili noma'lum).

Rejim (tun/kun) `<html>` dagi `dark` klassi bilan boshqariladi, `dark:`
klasslari qurilma mavzusiga emas, shu klassga qaraydi. Kunduzgi rejim ranglari
`globals.css` da Tailwind rang o'zgaruvchilarini almashtirish orqali beriladi
— tungi rejim ranglariga tegmang.

Izoh yozganda "nima qilinyapti" emas, **"nega shunday qilingan"** ni yozing: kod
nima qilishini o'zi ko'rsatib turadi.

## Texnologiyalar

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind v4 ·
Prisma 7 (driver adapter) · PostgreSQL (Neon) · Vercel.

Next.js 16 ko'p narsani o'zgartirgan — `AGENTS.md` aytganidek, kod yozishdan oldin
`node_modules/next/dist/docs/` dagi tegishli qo'llanmani o'qing. Masalan `next lint`
olib tashlangan, loyihada eslint yo'q.

## Buyruqlar

```bash
npm run dev           # lokal ishlab chiqish
npm run build         # yig'ish (deploy'dan oldin tekshirish uchun)
npx tsc --noEmit      # turlarni tekshirish
npm run db:push       # schema o'zgarishini bazaga yozish va Prisma mijozini yangilash
npm run db:backup     # bazaning to'liq zaxirasi -> zaxira/*.json
npm run db:restore -- zaxira/<fayl>.json    # zaxiradan tiklash
npm run db:clean      # demo'ni tozalab, haqiqiy markazni ochish (savol berib boradi)
npm run db:billing-type  # bir martalik: abonementi bor mijozlarni "Abonement" deb belgilaydi
npm run db:solo-code     # yakka mutaxassis taklif kodini qo'yish / o'chirish
npm run db:timezone   # bir martalik: eski vaqtlarni markaz zonasiga ko'chiradi
npm run db:seed       # demo ma'lumot — DIQQAT, pastga qarang
```

**Jonli bazaga `db push` Vercel'ning o'zida bajariladi** (`vercel-build` →
`prisma/vercel-build.mjs`, faqat production): ustun yoki jadval qo'shgan PR
merge qilinsa, baza saytdan oldin yangilanadi. Ma'lumot o'chiradigan
o'zgarishni Prisma rad etadi va chiqarish to'xtaydi — uni zaxira olib qo'lda
qiling. Shuning uchun ustunni o'chirish yoki nomini o'zgartirishni
qo'shishdan alohida PR qiling. Skriptdan `--accept-data-loss` ni hech qachon
qo'shmang.

Prisma 7 da `prisma db push` Prisma mijozini **o'zi qayta yasamaydi** — shuning
uchun `db:push` skriptiga `prisma generate` ham qo'shilgan. Uni olib tashlamang:
usiz yangi ustun kodga ko'rinmaydi va "Unknown argument" xatosi chiqadi.

`db:backup` hech narsa o'rnatishni talab qilmaydi (pg_dump kerak emas). Zaxira
fayllarida shaxsiy ma'lumot bo'lgani uchun `zaxira/` papkasi git'ga tushmaydi —
uni git'ga qo'shmang.

### Xavfli buyruqlar

**`npm run db:seed` va `npm run db:reset` bazadagi HAMMA narsani o'chiradi.**
Haqiqiy mijoz ma'lumoti turgan bazada hech qachon ishlatmang. Lokal `.env` ko'pincha
o'sha bulutdagi bazaga ulangan bo'ladi — ishga tushirishdan oldin `DATABASE_URL`
qayerni ko'rsatayotganini tekshiring.

`db:restore` ham bazani almashtiradi — u ham shunday xavfli. `db:clean` esa
ataylab tozalaydi (haqiqiy ishga o'tish uchun): u o'zi zaxira oladi va tasdiq
so'zini yozdiradi.

Ikkala skriptda to'siq bor: baza lokal bo'lmasa va ichida ma'lumot bo'lsa, ular o'zi
to'xtaydi va nima yo'qolishini ko'rsatadi. To'siqni `SEED_CONFIRM` / `RESTORE_CONFIRM`
bilan ataylab ochish mumkin — buni faqat zaxira olgandan keyin qiling. To'siqni
kodidan olib tashlamang.

## Vaqt zonasi

Markaz **Asia/Tashkent** da, Vercel'dagi server esa UTC da turadi. Zona
`src/instrumentation.ts` da, kodda belgilanadi (muhit o'zgaruvchisiga
tashlanmagan: bir marta yozilmay qolsa butun jadval jimgina 5 soatga siljib
ketardi). Terminaldagi skriptlar va tekshiruvlar uchun `.env` da ham
`TZ="Asia/Tashkent"` turishi kerak.

Shuning uchun:

- Odam kiritgan vaqt (`datetime-local`) markaz vaqti deb tushuniladi.
  `new Date("...T09:00")`, `setHours`, `getHours` — hammasi shu zonada.
- `Session.startsAt` va `Intake.scheduledAt` — odam kiritgan vaqtlar.
  `createdAt`, `sentAt` kabi maydonlar haqiqiy lahza, ularga zona ta'sir
  qilmaydi. Sana-kunlik maydonlar (`birthDate`, `paidAt`) yarim tunda UTC
  bo'lib turadi va ikkala zonada ham o'sha kunni ko'rsatadi.
- Prisma `DateTime` ni PostgreSQL'da zonasiz (`timestamp`) saqlaydi va doim
  UTC deb o'qiydi. Bazaga to'g'ridan-to'g'ri `pg` bilan ulangan kod ham
  shunday o'qishi kerak — `tests/db.mjs` dagi type parser shu uchun.

## Testlar

Brauzerdagi uchidan-uchiga tekshiruvlar, jami 327 ta. Haqiqiy `next build` ustida
ishlaydi va natijani to'g'ridan-to'g'ri bazadan tekshiradi.

```bash
npm run build && npm start -- -p 3100    # boshqa terminalda
node tests/smoke.mjs      # CRM, rollar, qabullar, filiallar, bo'sh vaqtlar, sozlamalar, zaxira, Telegram holati, kunlik to'lov, mijozni o'chirish, to'lovni tuzatish, panel jadvallari, vaqt zonasi, yakka mutaxassis, PWA, kanalga e'lon, Telegram'da login yopiq, xizmatlar, abonementsiz hisob, egani tahrirlash, mijoz formasi, yakka sozlamalari, qo'shish oynasi yopilishi, ish vaqti va tushlik, Google Sheets zaxira (jonli), mijozlar puli va holati (233)
node tests/telegram.mjs   # bog'lanish, imzo, mutaxassis Mini App (19)
node tests/parent.mjs     # ota-ona kabineti, eslatmalar, to'lovlar, mutaxassislar, bekor qilish, Farzandim, tun/kun, Telegram'dan tashqari kirish yo'q, yakka logoped mijozi, hisob-kitob (34)
node tests/click.mjs      # Click to'lov manzili: imzo, summa, Prepare/Complete (CLICK_* bo'lsa)
node tests/prefs.mjs      # tun/kun rejimi, til, tarjima to'liqligi, logotip, tepa panel (41)
```

Kod o'zgartirgandan keyin shu to'rttasini ishga tushiring. Yangi imkoniyat qo'shsangiz
— unga tekshiruv ham qo'shing.

## Rollar va ko'rish doirasi

| Rol | Ko'radi |
|---|---|
| `OWNER` | hamma filial, hamma narsa; `branchId` bo'sh bo'ladi. Faqat u filial va ikkinchi ega qo'sha oladi (o'zini o'chira olmaydi) |
| `BRANCH_ADMIN` | faqat o'z filiali (hozircha interfeysdan yaratilmaydi) |
| `RECEPTION` | o'z filiali: jadval, qabullar, mijozlar, to'lovlar |
| `SPECIALIST` | faqat o'z mijozlari va o'z puli |
| `PARENT` | faqat o'z farzandi |

`SPECIALIST` ikki xil bo'ladi. Markazdagisi — oddiy xodim. **Yakka
mutaxassis** (`isSolo`, `src/lib/auth.ts`) esa markazga tegishli emas: u
`/royxat` dan taklif kodi bilan o'zi ro'yxatdan o'tadi, o'ziga alohida filial
ochiladi (`Branch.isSolo`), ulushi 100%, mijozini o'zi qo'shadi va to'lovini
o'zi yozadi.

Yakka mutaxassis o'ziga o'zi rahbar, shuning uchun u telefon kabinetiga emas,
**rahbar paneliga** tushadi (`homePath()`): Panel, Jadval, Bo'sh vaqtlar,
Qabullar, Mijozlar, To'lovlar, Hisobotlar, Sozlamalar — faqat Xodimlar va
Filiallarsiz. Rahbar sahifalari `requireManager()` bilan himoyalanadi (ega,
filial admini yoki yakka). Panel va hisobotda "mutaxassis haqi / markaz
ulushi" ko'rinmaydi — pulning hammasi o'ziniki. Qabulda "kim ko'radi" so'ralmaydi,
server uni o'ziga yozadi. Seans narxini Sozlamalardan o'zi o'zgartiradi
(`Specialist.defaultPrice`).

Sozlamalarda yakka logoped o'z **ism-familiyasi va telefonini** (telefon —
login, shuning uchun joriy parol bilan), menyu tepasidagi **ilova nomi**
(`Branch.brandName`, bo'sh bo'lsa "Logoped CRM") va **logotipini**
(`Branch.logoData`, `/api/logo?b=<filial>`) o'zgartiradi. Bular uning o'z
filialida turadi — markazning nomi va logotipi (`Settings`) unga tegishli
emas, uni o'zgartira olmaydi. **Ish kunlari, ish vaqti va tushligi** ham
o'ziniki (`Branch.workStartHour` va h.k., `getWorkHours()`): hali kiritmagan
bo'lsa markaz ish vaqtiga tushadi. Bo'sh vaqtlar tushlikka to'g'ri keladigan
vaqtni taklif qilmaydi (`daySlots`).

Taklif kodi markaz panelida **ko'rinmaydi** — yakka mutaxassis markazga
tegishli emas, uni markaz rahbari emas, ilovani sotayotgan odam qabul qiladi.
Kod terminaldan qo'yiladi: `npm run db:solo-code -- <kod>` (ko'rish uchun
argumentsiz, yopish uchun `-- --yop`). Kod bo'sh bo'lsa `/royxat` ochilmaydi
va `/login` da ro'yxatdan o'tish havolasi ham ko'rinmaydi.

**Yakka mutaxassisning ishi markaznikiga aralashmasligi kerak.** Doira bitta
joyda — `NOT_SOLO` va `branchWhere()` da. Filial bo'yicha so'rov yozsangiz,
`branchId ? { branchId } : {}` deb yozmang: bo'sh obyekt begona yakka
mutaxassisning mijozlari va pulini ham qamrab oladi. Doim `branchWhere()`
ishlating, filiallar ro'yxatiga esa `NOT_SOLO`.

**Doira har bir so'rovda serverda qo'llanadi** (`src/lib/auth.ts` dagi `clientScope`,
`sessionScope`). Hech qachon faqat interfeysda yashirish bilan cheklanmang —
foydalanuvchi manzilni qo'lda yozishi mumkin.

## Pul mantig'i

Buni o'zgartirishdan oldin tushunib oling:

- **To'lov** mijozdan markazga keladi. Mijozga va (ixtiyoriy) abonementga bog'lanadi,
  **mutaxassisga emas**.
- **Mutaxassisning ish haqi** to'lovdan emas, **bajarilgan seansdan** hisoblanadi:
  seans narxi × foizi, seans "O'tdi/Kelmadi" deb belgilangan payt.
- **Mijozning to'lov turi** `Client.billingType`: `DAILY` (standart — har kelganida
  to'laydi) yoki `PACKAGE` (abonement oladi). Kunlik mijozda abonement, qolgan seans
  va qarzdorlik tushunchasi yo'q — interfeys ham, eslatmalar ham unga bu narsalarni
  ko'rsatmaydi.
- **Markazda abonement ishlatilmaydi** — har seans alohida hisoblanadi.
  Yangi mijoz doim `DAILY`, formalarda "To'lov turi" yo'q. Abonement, qolgan
  seans va qarzdorlik interfeysning **hech qayerida** ko'rinmaydi (panel,
  mijozlar, mijoz kartasi, to'lovlar, mutaxassis va ota-ona kabineti), abonement
  sotish formasi yo'q, abonement/qarz eslatmalari yuborilmaydi. Eski
  `Package` yozuvlari bazada qoladi: seans narxi va to'lov taqsimoti ularga
  hali ham tayanadi (pastdagi bandlar) — bu kod faqat eski ma'lumot uchun.
- **Seans narxi** abonementdan, abonement bo'lmasa xizmatdan olinadi. Narx ham
  seans bilan birga saqlanadi.
- **Xizmatlar** (`SessionType`, Sozlamalar → "Xizmatlar, narx va ulush"):
  nom + bitta seans narxi + mutaxassis ulushi (%). Bitta xodim ham logoped,
  ham massaj qilsa, har biri o'z narxida va o'z foizida hisoblanadi.
  Markaz xizmatlari `branchId` bo'sh (faqat ega boshqaradi), yakka
  logopedniki — uning filiali, ulushi doim 100% (`src/lib/session-types.ts`).
  Xizmat o'chirilmaydi, `isActive=false` bo'ladi.
- **Mijozga xizmat biriktiriladi** (`ClientService`, mijoz kartasi). **Seans
  faqat xizmat bilan yoziladi**: formada tanlanmasa mijozning xizmati olinadi
  (bittasi bo'lsa), xizmati yo'q yoki bir nechta bo'lsa — xato.
- **Abonement xizmatga bog'lanadi** (`Package.sessionTypeId`), narxi xizmatdan
  olinadi va abonementda saqlanadi. Seans shu xizmat abonementidan yechiladi;
  bunday abonement bo'lmasa — xizmatlardan oldin sotilgan, yo'nalishga
  bog'langan eski abonementdan (`Package.specialization`, qolgan seanslar
  kuymasin).
- **"O'tdi"/"Kelmadi"** belgilanganda: narx = seansda yozilgan → abonement →
  xizmat → (eski seanslar uchun) mutaxassis narxi → `Settings.defaultPrice`;
  ulush = xizmatniki → (eski seanslar uchun) `Specialist.salaryPercent`.
  Standart narx va xodim foizi interfeysda yo'q, faqat eski ma'lumot uchun.
- `billingType` ustuni keyin qo'shilgani uchun eski bazada hamma `DAILY` bo'lib
  qoladi. `npm run db:billing-type` abonementi borlarni bir marta `PACKAGE` ga
  o'tkazadi.
- **Foiz seans bilan birga saqlanadi** (`Session.salaryPercent`). Keyin mutaxassisning
  foizi o'zgarsa, o'tib bo'lgan seanslarning hisobi o'zgarmaydi. Buni buzmang.
- **Mijozlar ro'yxatidagi pul** (ega, qabulxona, yakka — markazdagi
  mutaxassisga ko'rinmaydi): *To'langan* = mijozning hamma to'lovlari,
  *Xizmatlar uchun* = "O'tdi"/"Kelmadi" seanslar narxi (rejadagisi
  sanalmaydi), *Qoldiq* = farqi (musbat — oldindan to'langan, manfiy — qarz).
  Konsultatsiya puli bunga kirmaydi — u mijozga emas, qabulga yoziladi.
  Ota-ona kabinetida ham xuddi shu uch raqam ko'rinadi (To'lovlar bo'limi,
  Farzandim'da qoldiq) — hisob bir xil bo'lishi kerak.
- **Qabul (konsultatsiya) puli** `Payment` jadvaliga tushmaydi (qabul hali mijoz
  emas) — summa `Intake.price` da turadi. Lekin u ham kassaga tushgan pul, shuning
  uchun `getOverview().collected` ga qo'shiladi va To'lovlar sahifasida alohida
  ro'yxat bo'lib ko'rinadi. Hisobotda "Konsultatsiyalardan" deb ajratib ham
  ko'rsatiladi. Bu uch joydagi raqam bir xil bo'lishi kerak.

**Mijozni o'chirish** ikki xil (ikkalasi ham faqat egada, bolaning ismini
yozib tasdiqlanadi):
- *Shaxsiy ma'lumotni tozalash* — ism, telefon, tashxis o'chadi, seans va
  to'lov yozuvlari qoladi. Kassa va ish haqi hisobi o'zgarmaydi.
- *Butunlay o'chirish* — mijoz bilan birga seans, to'lov, abonement va eslatma
  ketadi (bazada `onDelete: Cascade`), ya'ni o'tgan oylardagi hisobot ham
  o'zgaradi. Qabul (`Intake`) o'chmaydi — undan kelgan konsultatsiya puli
  kassada qolishi kerak, shuning uchun avval mijozdan uziladi.

Yangi jadval qo'shsangiz, uni `prisma/tables.ts` ga ham qo'shing — aks holda
`db:backup` uni zaxiraga olmaydi va `db:seed` tozalashda chet el kaliti xatosi
beradi.

## Ota-ona kabineti (Telegram Mini App)

Ota-ona botga `/start` yuborib raqamini ulashadi, "Kabinetni ochish" tugmasi
`/tg` orqali `/m` ga olib boradi (`src/app/m/parent.tsx`). Bo'limlar: Farzandim,
Jadval, Davomat, To'lovlar, Mutaxassislar.

- **Ota-ona akkaunti mijoz qo'shilganda doim ochiladi** (parolsiz,
  `passwordHash: ""`) — bot raqamni foydalanuvchilar orasidan qidiradi.
  Ilgari parolsiz qo'shilgan mijozlar uchun webhook raqamni mijoz kartasidan
  topib, akkauntni o'zi ochadi (`parentFromClients`).
- **Ota-ona faqat Telegram orqali kiradi.** `/login` uni parol bilan
  kiritmaydi (`error=telegram`), katta panel (`(app)` layout) uni `/m` ga
  qaytaradi. Kabinetda "To'liq ko'rinish", "Parol" va "Chiqish" yo'q.
  Telegram ichida `/login` (yoki `/`) ochilsa, sahifa `#tgWebAppData` ni ko'rib
  darhol `/tg` ga o'tkazadi — bog'lanmagan odam login formasini ko'rmaydi,
  "kabinet topilmadi" xabarini oladi. Bot har `/start` da suhbatning "Kabinet"
  menyu tugmasini `/tg` ga qo'yadi (`setKabinetMenu`).
- Kabinet ranglari (`.app-*`, `globals.css`) Telegram mavzusidan
  (`--tg-theme-*`) olinmaydi — aks holda tun/kun tugmasi ishlamaydi.
  Telegram sarlavhasi rejimga `src/app/m/tg-theme.tsx` orqali moslanadi.

- **Yakka logopedning mijozlari** ham shu bot va shu kabinetdan foydalanadi.
  Yakka logoped Sozlamalardan o'z kanaliga e'lon qo'yadi (matnda "logopedga
  bergan raqamingiz"). Kabinetda filialning ichki nomi ("Ism (yakka)")
  emas, logopedning ilova nomi (`brandName`) yoki ismi ko'rinadi; bekor
  qilish matnlari "markazga" emas, "logopedga".
- `Session.note` — xodimlarning ichki izohi, ota-onaga hech qachon
  ko'rsatilmaydi.
- **Ota-ona bekor qilishi** — holat `CANCELLED_CLIENT` (abonementdan
  yechilmaydi), sabab `note` ga qo'shiladi, mutaxassis va filial xodimlariga
  Telegram xabar boradi. Mashg'ulotga `PARENT_CANCEL_MIN_HOURS` dan kam qolsa
  bekor qilib bo'lmaydi — markazga qo'ng'iroq qilinadi.
- **Click orqali onlayn to'lov** (`src/lib/click.ts`, `/api/click`,
  `src/app/m/click-pay.tsx`). Ota-ona kabinetda summa yozadi, `ClickTransaction`
  yaratiladi, Click sahifasi ochiladi. Pul faqat Click'ning imzolangan
  **Complete** so'rovi kelganda `Payment` (usul `CLICK`) bo'lib yoziladi —
  kabinetning o'zida hech narsa "to'langan" hisoblanmaydi. Imzo va summa har
  so'rovda tekshiriladi, takroriy Complete ikkinchi to'lov yozmaydi. Yakka
  logopedning mijozlari bu yo'ldan to'lay olmaydi (Click hisobi markazniki).
  `CLICK_*` muhit o'zgaruvchilari bo'lmasa butun yo'l o'chiq. Click so'rovlarining
  maydonlari va imzo tartibini o'zgartirishdan oldin Click hujjatiga qarang.
- **Kanalga e'lon** — Sozlamalarda (ega va yakka logoped) bot nomidan
  ota-onalar kanaliga "Kabinetni ochish" tugmali post qo'yiladi
  (`postToChannel`, `src/lib/telegram.ts`). Kanalda `web_app` tugmasi
  ishlamaydi, shuning uchun tugma `t.me/<bot>?start=kanal` havolasi — avval
  raqam ulashiladi. Bot username kodda yozilmaydi, `getMe` dan olinadi.
- Odam yozgan matnni Telegram xabariga qo'yganda `escapeHtml` dan o'tkazing
  (`src/lib/notify.ts`) — xabarlar HTML rejimida ketadi.

## Diqqat qilinadigan joylar

- **Amal xatolari.** Server action'lar `withFlash` bilan o'raladi (`src/lib/action.ts`).
  Usiz Next.js production'da xato matnini yashiradi va foydalanuvchi sababni
  bilmaydi. Yangi action yozsangiz, uni ham o'rang.
- **Tahrirlash va qo'shish bo'limlari** `<details data-autoclose>` bo'lsin: ichidagi forma
  saqlangach (yashil xabar kelsa) bo'lim o'zi yopiladi, xatoda ochiq qoladi
  (`src/components/auto-close.tsx`, `Flash` ning `app:flash` hodisasi).
- **Bajarilgani ham ko'rinsin.** Natijasi ekranda darhol bilinmaydigan amal
  (tahrirlash, to'lov) `setFlash(xabar, "ok")` bilan yashil xabar qoldirsin.
  Aks holda foydalanuvchi "ishlamadi" deb o'ylaydi — ayniqsa yozuv ro'yxatdan
  chiqib ketsa (masalan sana boshqa oyga ko'chsa).
- **Xizmat ishchisi (sw.js) sahifalarni hech qachon keshlamaydi** — bitta telefondan
  ikki kishi kirsa, birining ma'lumoti ikkinchisiga ko'rinib qolmasligi uchun. Faqat
  o'zgarmas statik fayllar keshlanadi.
- **Mintaqa.** `vercel.json` da `fra1` — server baza bilan bir shaharda turishi shart.
  Bir sahifa bazaga 10-20 marta murojaat qiladi, ular uzoqlashsa ilova sekinlashadi.
- **Bazaga borib-kelishlar soni = tezlik.** `relationJoins` yoqilgan: `include`
  bog'langan jadvallarni alohida so'rovlar bilan emas, bitta SQL bilan oladi.
  Uni o'chirmang. Yangi sahifada so'rovlarni ketma-ket emas, `Promise.all` bilan
  bitta to'lqinda yuboring. Ota-ona kabineti hamma bo'limni bir martada yuklaydi
  va bo'limlar brauzerning o'zida almashadi (`src/app/m/parent-tabs.tsx`).
- **Telegram imzosi** `src/lib/telegram.ts` da tekshiriladi. `initData` ni tekshirmasdan
  ishonmang.
- **Google Sheets zaxirasi** (`src/lib/sheets.ts`). Foydalanuvchi o'z
  jadvaliga tayyor Apps Script qo'yib, "Web app" manzilini Sozlamalarga
  yozadi (`Settings.sheetsUrl`, yakka logopedda `Branch.sheetsUrl`) — Google
  Cloud kaliti kerak emas. **Har bir server action'dan keyin** (`withFlash`
  → `after` → `syncAfterChange`) jadval o'zi yangilanadi; bir vaqtda ikki
  yozuv to'qnashmasligi uchun `sheetsDirtyAt` belgi va `sheetsLockAt` qulf
  bor (`sheetsChanged`). Bundan tashqari kuniga bir marta eslatmalar yoki
  zaxira cron'i bilan (`runDailySheets`, 20 soatda bir martadan ko'p emas).
  Har safar varaq tozalanib qaytadan yoziladi. Mijozlar varag'ida
  to'langan / xizmatlar uchun / qoldiq — Mijozlar sahifasidagi bilan bir xil. Markaz jadvaliga yakka logopedlarning
  ma'lumoti tushmaydi, yakkaga — faqat o'ziniki. Parol va Telegram id
  yuborilmaydi; "=", "+" bilan boshlangan matn oldiga "'" qo'yiladi (formula
  bo'lib qolmasin). Manzil faqat `script.google.com/macros/.../exec`
  bo'lishi mumkin. Yangi jadval yoki ustun qo'shsangiz, `buildSheets` ga ham
  qo'shishni o'ylang.
- **Markaz sozlamalari** `src/lib/settings.ts` dagi `getSettings()` orqali olinadi.
  Bazada bitta qator (`id = "main"`); hali yozilmagan bo'lsa standart qiymatlar
  qaytadi — sahifa sozlama yo'qligi sababli ishlamay qolmasin. Ish vaqti
  shu yerdan olinadi va "Bo'sh vaqtlar" (`/slots`) o'shanga tayanadi.

## Ishlash tartibi

Loyiha ustida bir nechta odam ishlaydi. O'z tarmog'ingizda ishlang va Pull Request
qoldiring — to'g'ridan-to'g'ri asosiy tarmoqqa push qilmang.

Sahifadagi matnni tekshirganda `page.content()` emas, `innerText` ishlating:
`content()` HTML qaytaradi va pul formatidagi uzilmas probel u yerda `&nbsp;`
bo'lib qoladi — "100 000 so'm" hech qachon topilmaydi.
