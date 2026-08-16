# SaaS AI Bot Platform

منصة متعددة التجار (Multi-Tenant) لروبوتات الدردشة الذكية تعتمد على **Meta Cloud APIs** الرسمية و **RAG** مع Supabase pgvector.

---

## الميزات

| الميزة | الوصف |
|--------|-------|
| **قنوات متعددة** | واتساب + ماسنجر + إنستجرام من خلال API واحد |
| **RAG ذكي** | استرجاع الأصناف ذات الصلة فقط — يوفر 70-80% من التوكنز |
| **Multi-Tenant** | كل تاجر له بياناته وقنواته في Supabase — لا .env ثابت |
| **ذاكرة الزبائن** | حفظ البيانات والتفضيلات وسجل الطلبات لكل زبون |
| **برومبت ديناميكي** | قوالب مخصصة لكل نوع نشاط (مطعم/عيادة/متجر/صالون) |
| **إشعارات تليجرام** | وصول فوري للطلبات على مجموعة التاجر |
| **حماية** | Rate Limiting + Blacklist + Logging |
| **Production Ready** | Docker + PM2 + Health Check |

---

## البنية التقنية

```
Meta Cloud APIs ←→ Express Server ←→ Supabase (pgvector)
   (Webhooks)     (Node.js/JS)      (PostgreSQL + RAG)
                      │
                   Groq AI (ردود) + OpenAI (Embeddings)
```

---

## التثبيت السريع

```bash
# 1. نسخ المشروع
git clone <repo-url>
cd saas-ai-bot

# 2. تثبيت التبعيات
npm install

# 3. إعداد البيئة
cp config/.env.example config/.env
# عدّل config/.env بالقيم الخاصة بك

# 4. إعداد Supabase (شغّل database/schema.sql و database/functions.sql)

# 5. إضافة بيانات تجريبية (اختياري)
npm run seed

# 6. تشغيل
npm start

# أو مع PM2
pm2 start ecosystem.config.js
```

---

## Docker

```bash
docker build -t saas-ai-bot .
docker run -d -p 3000:3000 --env-file config/.env saas-ai-bot
```

---

## API Endpoints

| Method | Path | الوصف |
|--------|------|-------|
| GET | `/health` | فحص صحة الخادم |
| GET | `/webhook/whatsapp` | التحقق (Meta) |
| POST | `/webhook/whatsapp` | استقبال رسائل واتساب |
| GET | `/webhook/messenger` | التحقق (Meta) |
| POST | `/webhook/messenger` | استقبال رسائل ماسنجر + Referrals |
| GET | `/webhook/instagram` | التحقق (Meta) |
| POST | `/webhook/instagram` | استقبال رسائل إنستجرام |
| POST | `/api/onboard` | إضافة تاجر جديد + قناة + منيو |
| POST | `/api/menu/index` | إعادة فهرسة المنيو (RAG) |
| GET | `/api/stats` | إحصائيات المنصة |

---

## التوثيق الكامل

راجع `docs/SETUP.md` للدليل الكامل: إعداد Supabase، إعداد Meta Developer، النشر، واستكشاف الأخطاء.

---

## الترخيص

ISC
