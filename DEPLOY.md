# Internetga chiqarish (deploy)

Bu yo'riqnoma loyihani **bepul** manzilga chiqaradi va Telegram bot bilan
ulaydi. Kompyuterda emas, internetda ishlaydigan bo'ladi — ya'ni mutaxassislar
va ota-onalar telefonidan kira oladi.

Taxminan **40–60 daqiqa** vaqt oladi. Dasturchi bo'lish shart emas.

## Nima kerak (hammasi bepul)

| Nima | Qayerdan | Narx |
|---|---|---|
| GitHub akkaunt | github.com | bepul |
| Vercel akkaunt | vercel.com | bepul |
| Neon akkaunt (baza) | neon.tech | bepul |
| Telegram bot | @BotFather | bepul |

Domen sotib olish shart emas — Vercel bepul manzil beradi
(`loyiha-nomi.vercel.app`), u HTTPS bilan keladi va Telegram Mini App uchun
yetarli.

---

## 1-qadam. Bepul baza (Neon)

1. [neon.tech](https://neon.tech) ga kiring, GitHub orqali ro'yxatdan o'ting
2. **Create project** → nom: `logoped`, region: Europe (eng yaqini — Frankfurt)
3. Chap yuqoridagi yashil **Connect** tugmasini bosing

Ochilgan oynada ulanish manzili chiqadi. **Ikkita variantini ham oling** —
oynadagi **Connection pooling** belgisini yoqib va o'chirib:

| Variant | Manzilda | Qayerda ishlatiladi |
|---|---|---|
| **Pooled** | `-pooler` so'zi **bor** | Vercel (ilovaning o'zi) |
| **Direct** | `-pooler` so'zi **yo'q** | `prisma db push` (jadval yaratish) |

Manzil shunga o'xshaydi:

```
postgresql://foydalanuvchi:parol@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

> **Nega ikkitasi?** Pooled manzil ko'p ulanishni bitta kanalga yig'adi — bu
> Vercel kabi muhitlar uchun zarur, aks holda ulanishlar tugab qoladi. Lekin
> jadval yaratish buyruqlari (`db push`) o'sha kanal orqali ishlamasligi
> mumkin, shuning uchun ular to'g'ridan-to'g'ri manzilni ishlatadi.

**Bu manzilda parol bor — uni hech kimga yubormang va kodga yozmang.**

> Neon bepul tarifi bu loyihaga bemalol yetadi: 10 ta markaz, minglab seans.

## 2-qadam. Maxfiy kalitlarni yasash

Terminalda:

```bash
openssl rand -hex 32   # SESSION_SECRET uchun
openssl rand -hex 16   # TELEGRAM_WEBHOOK_SECRET uchun
openssl rand -hex 16   # CRON_SECRET uchun
```

Uchalasini alohida saqlab qo'ying.

## 3-qadam. Telegram bot

1. [@BotFather](https://t.me/BotFather) ga `/newbot`
2. Nom: masalan `Logoped Markaz`
3. Username: `_bot` bilan tugasin, masalan `logoped_markaz_bot`
4. BotFather bergan **tokenni** saqlang

## 4-qadam. Vercel'ga chiqarish

1. [vercel.com](https://vercel.com) ga GitHub orqali kiring
2. **Add New → Project** → ro'yxatdan `dantist-online-monitoring` ni tanlang
3. **Import** bosing
4. **Environment Variables** bo'limiga quyidagilarni kiriting:

| Nomi | Qiymati |
|---|---|
| `DATABASE_URL` | Neon'ning **pooled** manzili (`-pooler` bor) |
| `SESSION_SECRET` | 1-buyruq natijasi (64 belgi) |
| `TELEGRAM_BOT_TOKEN` | BotFather bergan token |
| `TELEGRAM_WEBHOOK_SECRET` | 2-buyruq natijasi |
| `CRON_SECRET` | 3-buyruq natijasi |
| `APP_URL` | hozircha bo'sh qoldiring, 6-qadamda to'ldiriladi |

5. **Deploy** bosing va 2–3 daqiqa kuting

Tayyor bo'lgach Vercel sizga manzil beradi, masalan:
`https://dantist-online-monitoring.vercel.app`

## 5-qadam. Bazani tayyorlash

Baza hali bo'sh — jadvallarni yaratish kerak. Buni **o'z kompyuteringizdan**
qilasiz:

```bash
cd ~/Documents/logoped-crm

# Bu yerda DIRECT (pooler'siz) manzil ishlatiladi
export DATABASE_URL="<direct connection string>"

npx prisma db push      # jadvallarni yaratadi
npm run db:seed         # demo ma'lumot to'ldiradi
```

Lokalda ham shu baza bilan ishlash uchun `.env` faylidagi `DATABASE_URL` ni
o'sha direct manzilga almashtiring, so'ng `npm run dev`.

> **Diqqat:** `npm run db:seed` bazadagi hamma narsani o'chirib, demo
> ma'lumotni qayta yozadi. Haqiqiy mijozlar kiritilgandan keyin uni
> **hech qachon ishlatmang**.
>
> Skriptda to'siq bor: baza lokal bo'lmasa va ichida ma'lumot bo'lsa, u o'zi
> to'xtaydi va nechta mijoz, seans, to'lov yo'qolishini ko'rsatadi. Shunga
> qaramay, buyruqni yozishdan oldin `DATABASE_URL` qayerni ko'rsatayotganini
> o'zingiz tekshiring.

Endi Vercel manzilini brauzerda oching va `+998901234567` / `parol123` bilan
kiring — demo ma'lumot bilan ishlayotgan bo'lishi kerak.

## 6-qadam. APP_URL ni to'ldirish

1. Vercel'da loyihangiz → **Settings → Environment Variables**
2. `APP_URL` ni tahrirlab, Vercel bergan manzilni yozing (oxirida `/` bo'lmasin):
   `https://dantist-online-monitoring.vercel.app`
3. **Deployments** → oxirgisining yonidagi uch nuqta → **Redeploy**

## 7-qadam. Telegram botni ulash

Terminalda (o'z qiymatlaringizni qo'ying):

```bash
TOKEN="<bot token>"
APP="https://dantist-online-monitoring.vercel.app"
SECRET="<TELEGRAM_WEBHOOK_SECRET>"

curl "https://api.telegram.org/bot$TOKEN/setWebhook?url=$APP/api/tg/webhook&secret_token=$SECRET"
```

Javobda `"ok":true` chiqishi kerak.

So'ng BotFather'da Mini App tugmasini qo'ying:

1. `/mybots` → botingizni tanlang → **Bot Settings → Menu Button**
2. **Configure menu button** → manzil: `https://.../tg`, matn: `Kabinet`

**Tekshirish:** botga `/start` yuboring → "Raqamimni yuborish" tugmasini
bosing → kabinet ochilishi kerak. (Raqamingiz bazada bo'lishi shart —
demo ma'lumotdagi raqamlardan birini o'zingizga yozib qo'ying yoki
tizimdan yangi xodim qo'shing.)

## 8-qadam. Eslatmalar (cron)

Ota-onalarga ertangi mashg'ulot, qarz va abonement haqida xabar yuborish
uchun kuniga bir marta chaqirilishi kerak.

[cron-job.org](https://cron-job.org) da bepul ro'yxatdan o'ting:

- **URL:** `https://.../api/tg/notify?secret=<CRON_SECRET>`
- **Schedule:** har kuni soat 19:00
- **Method:** POST

## Tezlik: server va baza bir joyda turishi shart

Bu eng ko'p uchraydigan "ilova sekin" sababi. Vercel yangi loyihalarni
**Vashingtonda** (`iad1`) ishga tushiradi, baza esa Neon'da qaysi shaharni
tanlagan bo'lsangiz — masalan **Frankfurtda**. Har bir sahifa bazaga 10-20
marta murojaat qiladi, har bir murojaat esa okean ortiga borib qaytadi:
sahifa bir necha soniyaga cho'ziladi.

Loyihada `vercel.json` bor va unda `"regions": ["fra1"]` yozilgan — ya'ni
server ham Frankfurtda ishlaydi. Baza boshqa shaharda bo'lsa, shu faylni
o'zgartiring. Dashboard'dan tekshirish: **Settings → Functions → Function
Regions**. (Bepul tarifda bitta mintaqa tanlanadi — bu yetarli.)

Neon'ning bepul tarifida baza 5 daqiqa tegilmasa uxlab qoladi, keyingi
birinchi so'rov 1-2 soniya kutadi. Bu normal; keyingi sahifalar tez ochiladi.

---

## Haqiqiy ishga o'tish

Demo ma'lumot bilan sinab ko'rib bo'lgach, markazning o'z ishini boshlashdan
oldin bazani tozalash kerak. Demo hisoblarning paroli hammaga ma'lum
(`parol123`, README'da ham yozilgan), shuning uchun ularni qoldirib bo'lmaydi.

```bash
npm run db:clean
```

Skript savol berib boradi: filial nomi, eganing ismi, telefoni va paroli.
Tozalashdan oldin o'zi zaxira oladi, oxirida esa `TOZALASH` deb yozishni
so'raydi — xato bosilgan buyruq bilan o'chib ketmaydi.

Shundan keyin Vercel sozlamalarida `DEMO_LOGINS` o'zgaruvchisi bo'lsa, uni
ham olib tashlang.

---

## Tekshirish ro'yxati

- [ ] Vercel manzili ochiladi, kirish ishlaydi
- [ ] Mutaxassis sifatida kirganda telefon kabineti ochiladi
- [ ] Qabulxona xodimida faqat 3 bo'lim ko'rinadi
- [ ] Botga `/start` → raqam → kabinet ochildi
- [ ] Telefonda "Bosh ekranga qo'shish" ishladi (`/install` sahifasi)
- [ ] Cron chaqirilganda `{"ok":true}` qaytdi
- [ ] Settings → Functions'da mintaqa baza turgan shaharga mos
- [ ] Haqiqiy ishdan oldin: `npm run db:clean` bajarildi, `DEMO_LOGINS` olib tashlandi

---

## Muhim ogohlantirishlar

**1. Avval faqat demo ma'lumot bilan sinang.** Haqiqiy bolalar va ota-onalar
ma'lumotini kiritishdan oldin quyidagi savolni hal qiling: O'zbekiston
qonunchiligida fuqarolarning shaxsiy ma'lumotlari mamlakat hududidagi
serverlarda saqlanishi talab qilinadi. Neon va Vercel — chet el serverlari.
Yurist bilan maslahatlashing; kerak bo'lsa keyinchalik mahalliy hostingga
ko'chamiz (kod o'zgarmaydi, faqat `DATABASE_URL` va server almashadi).

**2. Vercel'ning bepul tarifi tijorat uchun emas.** Mijozlardan pul olishni
boshlaganingizda pullik tarifga o'tish kerak.

**3. `SESSION_SECRET` ni hech kimga bermang.** U o'zgarsa, hamma tizimdan
chiqib ketadi (xavfli emas, shunchaki qayta kirish kerak bo'ladi).

**4. Zaxira nusxa.** Neon avtomatik zaxira oladi, lekin oyiga bir marta
o'zingiz ham nusxa oling:

```bash
pg_dump "<DATABASE_URL>" > zaxira-$(date +%F).sql
```

## Android ilovasi (APK)

Mutaxassislar kabinetni telefonga oddiy ilova qilib o'rnatishi uchun. APK
ichida sayt ochiladi (TWA), shuning uchun saytdagi har bir o'zgarish ilovada
ham darhol ko'rinadi — APK'ni qayta yasash shart emas.

1. [pwabuilder.com](https://www.pwabuilder.com) ga sayt manzilini kiriting →
   **Package for stores** → **Android** → **Generate Package**
2. **Package ID**: masalan `uz.logoped.crm`, **Signing key**: *Create new*
3. Yuklangan zip ichida: `.apk` (telefonga o'rnatish uchun), `.aab` (Google
   Play uchun), imzo kaliti va `assetlinks.json`

**Imzo kaliti va parolini xavfsiz joyda saqlang.** U yo'qolsa, ilovani
yangilab bo'lmaydi — yangi ilova sifatida qaytadan tarqatishga to'g'ri keladi.

4. Vercel → **Settings → Environment Variables** ga `assetlinks.json` dagi
   qiymatlarni yozing va qayta deploy qiling:

| Nomi | Qiymati |
|---|---|
| `ANDROID_PACKAGE_NAME` | `package_name` (masalan `uz.logoped.crm`) |
| `ANDROID_SHA256_FINGERPRINTS` | `sha256_cert_fingerprints` ichidagi iz (`AA:BB:...`). Google Play'ga qo'yilsa, Play Console'dagi "App signing" izini ham vergul bilan qo'shing |

5. Tekshirish: `https://<sayt>/.well-known/assetlinks.json` ochilib, shu
   qiymatlarni ko'rsatishi kerak. Shundan keyin ilova tepasida brauzer satri
   ko'rinmaydi.

APK'ni mutaxassislarga Telegram orqali yuborasiz; o'rnatishda Android
"noma'lum manbadan o'rnatish"ga ruxsat so'raydi.

## Click orqali onlayn to'lov

Ota-ona kabinetida ("To'lovlar" bo'limi) "Click orqali to'lash" bloki chiqadi:
summa yoziladi va Click sahifasi ochiladi (Uzcard / Humo kartasi bilan). Pul
Click tasdiqlagandan keyin avtomatik "To'lovlar" ga **Click** usuli bilan
yoziladi va ota-onaning qoldig'i yangilanadi. Yakka logopedning mijozlarida
bu blok yo'q: Click hisobi markazniki.

1. [Click](https://click.uz) bilan **SHOP-API** (merchant) shartnomasi tuzing.
   Click sizga `service_id`, `merchant_id` va `SECRET_KEY` beradi.
2. Click merchant kabinetida **Prepare URL** va **Complete URL** ga ikkalasiga
   ham bitta manzilni yozing: `https://<sayt>/api/click`
3. Vercel → **Settings → Environment Variables** ga qo'shing va qayta deploy qiling:

| Nomi | Qiymati |
|---|---|
| `CLICK_SERVICE_ID` | Click bergan `service_id` |
| `CLICK_MERCHANT_ID` | Click bergan `merchant_id` |
| `CLICK_SECRET_KEY` | Click bergan `SECRET_KEY` (hech kimga bermang) |

Uchalasi ham yozilmaguncha Click o'chiq: kabinetda blok ko'rinmaydi, `/api/click`
esa so'rovni rad etadi. Avval Click'ning sinov (test) rejimida bitta to'lovni
sinab ko'ring. Sinov: `node tests/click.mjs` (server va test bir xil `CLICK_*`
bilan ishlashi kerak).

## Vaqt zonasi (bir martalik)

Markaz Toshkent vaqtida, Vercel'dagi server esa UTC da ishlaydi. Dastur
zonani kodning o'zidan oladi (`src/instrumentation.ts`), shuning uchun
Vercel'ga hech narsa qo'shish shart emas.

Lekin shu o'zgarish chiqqanidan keyin **eski yozuvlarni bir marta ko'chirish
kerak**: ular UTC vaqtida yozilgan va yangi kodda 5 soat keyin ko'rinadi.

```bash
npm run db:backup     # avval zaxira
npm run db:push       # yangi ustun uchun
npm run db:timezone   # vaqtlarni ko'chiradi, tasdiq so'raydi
```

Skript ikki marta ishlamaydi — bir marta bajargandan keyin o'zi to'xtaydi.
Ko'chirish faqat seans va qabul vaqtlariga tegadi; to'lov sanalari,
tug'ilgan sana va yozuvlarning yaratilgan vaqti o'z joyida qoladi.

Keyin jadvalni ochib, vaqtlar avvalgidek turganini tekshiring.

## Keyin kod o'zgarsa

```bash
git push    # Vercel o'zi ko'radi va yangi versiyani chiqaradi
```

Baza tuzilishi o'zgargan bo'lsa (yangi jadval yoki ustun) — **hech narsa
qilish shart emas.** Vercel haqiqiy saytni yig'ishdan oldin `prisma db push`
ni o'zi bajaradi (`vercel-build` skripti, `prisma/vercel-build.mjs`):

- faqat production'da — PR'larning preview versiyalari bazaga tegmaydi;
- `db push` uchun to'g'ridan-to'g'ri manzil olinadi: `DIRECT_DATABASE_URL`
  yoki `DATABASE_URL_UNPOOLED` bo'lsa o'sha, bo'lmasa `DATABASE_URL` dan
  `-pooler` olib tashlanadi;
- o'zgarish ma'lumot o'chirishni talab qilsa (ustun yoki jadvalni olib
  tashlash), Prisma rad etadi va **chiqarish to'xtaydi** — eski versiya
  ishlab turaveradi. Bunday o'zgarishni zaxira olib, qo'lda qiling:

```bash
npm run db:backup
export DATABASE_URL="<Neon direct connection string>"
npx prisma db push      # nima o'chishini ko'rsatadi va tasdiq so'raydi
```

Favqulodda holatda avtomatik yangilashni o'chirish: Vercel → Settings →
Environment Variables → `SKIP_DB_PUSH` = `1`.

Vercel loyihasida **Build Command** qo'lda o'zgartirilmagan bo'lishi kerak
(Settings → Build and Deployment → Build Command — "Override" o'chiq). Shunda
Vercel `package.json` dagi `vercel-build` ni o'zi ishlatadi.
