# دليل التثبيت والإعداد الكامل

## SaaS AI Bot Platform — Multi-Tenant AI Chatbot

هذا الدليل يشرح كيفية تشغيل المنصة من الصفر حتى النشر على السيرفر.

---

## نظرة عامة على البنية

```
العميل (واتساب/ماسنجر/إنستجرام)
        │
        ▼
Meta Cloud API (Webhook)
        │
        ▼
┌────────────────────────────────────────────┐
│  SaaS AI Bot Platform (Node.js + Express)  │
│                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Webhook  │  │  Router  │  │ AI (Groq)│  │
│  │ Handlers │→ │  (توجيه) │→ │  (ردود)  │  │
│  └──────────┘  └────┬─────┘  └────┬─────┘  │
│                     │             │          │
│              ┌──────┴──────┐      │          │
│              │   RAG       │      │          │
│              │ (pgvector)  │──────┘          │
│              └──────┬──────┘                 │
│                     ▼                        │
│              ┌──────────────┐                │
│              │   Supabase   │                │
│              │  (Database)  │                │
│              └──────────────┘                │
└────────────────────────────────────────────┘
```

---

## الخطوة 1: إعداد Supabase (قاعدة البيانات)

### 1.1 إنشاء مشروع جديد
1. اذهب إلى [supabase.com](https://supabase.com)
2. أنشئ حساب جديد (مجاني)
3. اضغط **New Project**
4. اختر اسماً ومنطقة قريبة منك (اختر nearest)
5. انتظر حتى ينتهي المشروع (2-3 دقائق)

### 1.2 تفعيل pgvector
1. اذهب إلى **SQL Editor** في Supabase Dashboard
2. الصق الأمر التالي ونفذه:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 1.3 إنشاء الجداول
1. انسخ محتوى الملف `database/schema.sql`
2. الصقه في **SQL Editor** ونفذه

### 1.4 إنشاء الدوال (Functions)
1. انسخ محتوى الملف `database/functions.sql`
2. الصقه في **SQL Editor** ونفذه

### 1.5 استخراج المفاتيح
1. اذهب إلى **Project Settings → API**
2. انسخ:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** → `SUPABASE_SECRET_KEY`

---

## الخطوة 2: إعداد Meta Developer App

### 2.1 إنشاء التطبيق
1. اذهب إلى [developers.facebook.com](https://developers.facebook.com)
2. اضغط **My Apps → Create App**
3. اختر نوع التطبيق: **Business** أو **Other**
4. أضف المنتجات التالية:

### 2.2 إضافة WhatsApp
1. في Dashboard، اضغط **Add Product → WhatsApp**
2. أضف **Phone Number** جديد (احصل على رقم واتساب Business)
3. من **API Setup**، احصل على:
   - **Phone Number ID** → `meta_phone_id`
   - **Temporary Access Token** (صالحة 24 ساعة — للاستخدام الدائم تحتاج User Access Token طويل الأمد)

### 2.3 إضافة Messenger (ماسنجر)
1. أضف منتج **Messenger**
2. اربطه بـ **Facebook Page** الخاصة بالتاجر
3. من Page Settings → **Page Access Token**

### 2.4 إضافة Instagram
1. أضف منتج **Instagram Graph API**
2. اربطه بحساب **Instagram Business**
3. احصل على **Instagram User ID** و **Access Token**

### 2.5 إعداد Webhooks
لكل قناة (واتساب/ماسنجر/إنستجرام):
1. اذهب إلى **App Settings → Webhooks**
2. اضغط **Add Callback URL**
3. أدخل رابط السيرفر:
   ```
   واتساب:   https://your-domain.com/webhook/whatsapp
   ماسنجر:  https://your-domain.com/webhook/messenger
   إنستجرام: https://your-domain.com/webhook/instagram
   ```
4. أدخل **Verify Token**: نفس القيمة في `META_WEBHOOK_VERIFY_TOKEN`
5. اشترك في الحقول: `messages` و `messaging_postbacks`

---

## الخطوة 3: إعداد ملفات المشروع

### 3.1 نسخ ملف البيئة
```bash
cp config/.env.example config/.env
```

### 3.2 تعديل config/.env
افتح الملف وعدّل القيم:

```env
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SECRET_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

GROQ_API_KEY=gsk_xxxxxxxxxxxxx
GROQ_MODEL=llama-3.3-70b-versatile

OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx

META_WEBHOOK_VERIFY_TOKEN=your-secret-token

TELEGRAM_BOT_TOKEN=123456789:AAAAA-bbbbb...

PORT=3000
```

### 3.3 الحصول على المفاتيح

| المفتاح | من أين |
|---------|--------|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `SUPABASE_SECRET_KEY` | Supabase Dashboard → Settings → API → service_role |
| `GROQ_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `META_WEBHOOK_VERIFY_TOKEN` | اختر أي كلمة سرية (مثل: `my-secret-123`) |
| `TELEGRAM_BOT_TOKEN` | من @BotFather في تليجرام |

---

## الخطوة 4: تشغيل المشروع

### 4.1 تثبيت التبعيات
```bash
npm install
```

### 4.2 تشغيل البيانات التجريبية (اختياري)
```bash
npm run seed
```
هذا يضيف تاجر تجريبي (حسين سوشي) مع منيوه وقناته.

### 4.3 تشغيل الخادم
```bash
# مباشرة
npm start

# أو مع PM2 (للاستقرار في الإنتاج)
npm install -g pm2
npm run pm2:start
```

### 4.4 التحقق من التشغيل
```bash
curl http://localhost:3000/health
```

النتيجة المتوقعة:
```json
{"status":"ok","uptime":0.5,"timestamp":"2025-...","sessions":0}
```

---

## الخطوة 5: النشر على السيرفر

### الخيار أ: Docker (موصى به)

```bash
# بناء الصورة
docker build -t saas-ai-bot .

# تشغيل الحاوية
docker run -d \
  --name saas-bot \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file config/.env \
  saas-ai-bot
```

### الخيار ب: PM2 على VPS

```bash
# تثبيت PM2
npm install -g pm2

# تشغيل
pm2 start ecosystem.config.js

# حفظ الإعدادات
pm2 save
pm2 startup
```

### الخيار ج: Vercel / Railway / Render

1. اربط المستودع
2. أضف Environment Variables من `config/.env`
3. Set Build Command: `npm install`
4. Set Start Command: `node src/server.js`

---

## الخطوة 6: إضافة تاجر جديد (Onboarding)

### عبر API مباشرة:

```bash
curl -X POST http://localhost:3000/api/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "مطعم البركة",
    "whatsapp_number": "201234567890",
    "business_type": "restaurant",
    "menu_items": [
      {
        "item_name": "كباب",
        "description": "كباب لحم ضأن طازج",
        "category": "مشويات",
        "price": 120
      },
      {
        "item_name": "دجاج مشوي",
        "description": "دجاج كامل مشوي مع أرز",
        "category": "مشويات",
        "price": 95
      }
    ],
    "faqs": [
      {
        "question": "كام التوصيل؟",
        "answer": "مجاني فوق 100 جنيه",
        "keywords": ["توصيل", "دليفري"]
      }
    ],
    "system_prompt": "المطعم مفتوح من 10 ص حتى 12 م",
    "meta_phone_id": "123456789",
    "meta_access_token": "EAABwzLixnjYBO..."
  }'
```

### أو مباشرة في Supabase:
1. أضف صفاً في جدول `clients`
2. أضف صفاً في جدول `channels` (meta_phone_id + meta_access_token)
3. أضف الأصناف في `menu_items`
4. شغّل `POST /api/menu/index` لفهرسة المنيو في RAG

---

## الخطوة 7: إشعارات تليجرام

لكي يستلم التاجر إشعارات الطلبات على تليجرام:
1. أنشئ بوت مع @BotFather واحصل على التوكن
2. أضف البوت لمجموعة التاجر أو احصل على chat_id من @userinfobot
3. احفظ `telegram_chat_id` في جدول `clients` للتاجر المعني

---

## هيكل المشروع

```
saas-ai-bot/
├── config/
│   ├── .env              ← ملف البيئة (لا يُرفع على Git)
│   ├── .env.example      ← نموذج الملف
│   └── constants.js      ← ثوابت النظام
├── database/
│   ├── schema.sql        ← مخطط قاعدة البيانات الكامل
│   └── functions.sql     ← دوال البحث المتجهي
├── docs/
│   └── SETUP.md          ← هذا الملف
├── scripts/
│   └── seed.js           ← إضافة بيانات تجريبية
├── src/
│   ├── server.js         ← نقطة الدخول (Express)
│   ├── ai/
│   │   ├── groq.js       ← محرك الذكاء الاصطناعي
│   │   ├── parser.js     ← تفكيك ORDER_JSON
│   │   ├── memory.js     ← ذاكرة المحادثة
│   │   └── prompts/      ← قوالب البرومبت حسب النشاط
│   ├── rag/
│   │   ├── embedder.js   ← توليد Embeddings
│   │   └── retriever.js  ← البحث المتجهي + الهجين
│   ├── meta/
│   │   ├── metaApi.js          ← إرسال الرسائل لـ Meta
│   │   ├── whatsappWebhook.js  ← استقبال واتساب
│   │   ├── messengerWebhook.js ← استقبال ماسنجر
│   │   └── instagramWebhook.js ← استقبال إنستجرام
│   ├── bot/
│   │   ├── router.js     ← الموزّع الرئيسي
│   │   └── cron.js       ← مهام مجدولة
│   ├── db/
│   │   ├── supabase.js       ← اتصال Supabase
│   │   ├── clients.js        ← التجار
│   │   ├── customers.js      ← الزبائن
│   │   ├── preferences.js    ← التفضيلات
│   │   ├── orders.js         ← الطلبات
│   │   └── conversations.js  ← المحادثات
│   ├── services/
│   │   ├── session.js    ← ذاكرة المحادثات
│   │   ├── scheduler.js  ← مهام مجدولة
│   │   ├── telegram.js   ← إشعارات تليجرام
│   │   └── pdf.js        ← قراءة PDF
│   └── middleware/
│       ├── rateLimiter.js ← منع السبام
│       ├── blacklist.js   ← قائمة الحظر
│       └── logger.js      ← تسجيل الأحداث
├── Dockerfile
├── ecosystem.config.js   ← إعدادات PM2
├── package.json
└── README.md
```

---

## استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| Webhook لا يعمل | تأكد أن URL يبدأ بـ `https://` وليس `http://` |
| فشل Verification | تأكد أن `META_WEBHOOK_VERIFY_TOKEN` متطابق في .env و Meta App |
| رسالة لا تصل | افحص logs: `pm2 logs saas-ai-bot` أو `docker logs saas-bot` |
| RAG لا يعمل | تأكد أن pgvector مفعل: `CREATE EXTENSION vector;` |
| Embeddings فاشلة | تأكد من `OPENAI_API_KEY` |
| Groq يرفض | تأكد من `GROQ_API_KEY` والنموذج متاح |

---

## الأمان

- لا تشارك `SUPABASE_SECRET_KEY` (service_role) — يتجاوز Row Level Security
- استخدم HTTPS دائماً (Let's Encrypt مجاني)
- غيّر `META_WEBHOOK_VERIFY_TOKEN` إلى كلمة قوية
- راجع `inbound_log` لمراقبة الاستعلامات المشبوهة
- استخدم `blacklist` لحظر الأرقام المزعجة
