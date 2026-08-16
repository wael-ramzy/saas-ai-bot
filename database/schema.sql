-- ═══════════════════════════════════════════════════════════════════════════
-- SaaS AI Bot Platform — Supabase Schema v2
-- Multi-Tenant | RAG (pgvector) | Meta Cloud APIs (WhatsApp/Messenger/Instagram)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. تفعيل الإضافات المطلوبة
-- ─────────────────────────────────────────────
create extension if not exists vector;  -- pgvector للبحث الدلالي (RAG)

-- ─────────────────────────────────────────────
-- 2. جدول التجار (Tenants)
-- كل تاجر (مطعم/عيادة/متجر) يمثل صف هنا
-- ─────────────────────────────────────────────
create table if not exists clients (
    client_id        uuid primary key default gen_random_uuid(),
    client_name      text not null,
    whatsapp_number  text unique,          -- رقم الواتساب الرسمي للتاجر (لربط القناة)
    business_type    text not null default 'base'
                       check (business_type in ('restaurant','مطعم','clinic','عيادة','store','متجر','base','salon','gym','other')),
    is_active        boolean not null default true,
    system_prompt    text,                 -- تعليمات مخصصة إضافية من التاجر
    pdf_menu_url     text,                 -- رابط PDF المنيو (اختياري)
    menu_text        text,                 -- النص الخام للمنيو (احتياطي قبل المعالجة)
    timezone         text not null default 'Africa/Cairo',
    language         text not null default 'ar',
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists idx_clients_whatsapp on clients (whatsapp_number);
create index if not exists idx_clients_active on clients (is_active);

-- ─────────────────────────────────────────────
-- 3. جدول القنوات (Channels)
-- كل تاجر ممكن يكون عنده أكثر من قناة
-- واتساب / ماسنجر / إنستجرام
-- التوكنات والمعرفات تُخزن هنا لكل تاجر — وليس في .env
-- ─────────────────────────────────────────────
create table if not exists channels (
    channel_id       uuid primary key default gen_random_uuid(),
    client_id        uuid not null references clients(client_id) on delete cascade,
    channel_type     text not null
                       check (channel_type in ('whatsapp','messenger','instagram')),
    -- ── بيانات Meta Cloud API ──
    meta_phone_id    text,                 -- Phone Number ID (واتساب)
    meta_page_id     text,                 -- Page ID (ماسنجر)
    meta_ig_account_id text,              -- Instagram Business Account ID
    meta_access_token text not null,       -- Page Access Token أو System User Token
    meta_app_secret  text,                -- App Secret (للتشفير)
    meta_verify_token text,               -- Verify Token للـ Webhook
    webhook_url      text,                 -- رابط الـ webhook الخاص بهذا التاجر
    -- ── الحالة ──
    is_active        boolean not null default true,
    last_active_at   timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique(client_id, channel_type)
);

create index if not exists idx_channels_client on channels (client_id);
create index if not exists idx_channels_phone on channels (meta_phone_id);

-- ─────────────────────────────────────────────
-- 4. جدول معرفة المنيو كـ Chunks (لـ RAG)
-- كل صنف في المنيو يصبح chunk منفصل مع embedding
-- ─────────────────────────────────────────────
create table if not exists menu_items (
    item_id          uuid primary key default gen_random_uuid(),
    client_id        uuid not null references clients(client_id) on delete cascade,
    item_name        text not null,        -- اسم الصنف
    item_text        text not null,        -- وصف + سعر + تفاصيل الصنف
    category         text,                 -- قسم المنيو (مشويات/عصائر/...)
    price            numeric,              -- السعر كرقم للتحقق
    is_available     boolean not null default true,
    keywords         text[],               -- كلمات مفتاحية للبحث النصي
    created_at       timestamptz not null default now(),
    unique(client_id, item_name)
);

create index if not exists idx_menu_items_client on menu_items (client_id);
create index if not exists idx_menu_items_category on menu_items (client_id, category);

-- ─────────────────────────────────────────────
-- 5. جدول المتجهات (Vector Store) — قلب نظام RAG
-- يخزن الـ embeddings لكل صنف في المنيو + عبارات شائعة
-- ─────────────────────────────────────────────
create table if not exists embeddings_store (
    embedding_id     uuid primary key default gen_random_uuid(),
    client_id        uuid not null references clients(client_id) on delete cascade,
    item_id          uuid references menu_items(item_id) on delete cascade,
    content_type     text not null
                       check (content_type in ('menu_item','faq','service','policy')),
    content_text     text not null,        -- النص الأصلي (لعرضه في البرومبت)
    embedding        vector(1536) not null, -- embedding من OpenAI ada-002 أو bge-m3
    created_at       timestamptz not null default now()
);

create index if not exists idx_embeddings_client on embeddings_store (client_id);

-- ── فهرس IVFFlat للبحث السريع بالـ cosine similarity ──
create index if not exists idx_embeddings_cosine
    on embeddings_store
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

-- ─────────────────────────────────────────────
-- 6. جدول الأسئلة الشائعة (FAQs)
-- يُمكّن البوت من الإجابة على أسئلة متكررة بدقة
-- ─────────────────────────────────────────────
create table if not exists faqs (
    faq_id           uuid primary key default gen_random_uuid(),
    client_id        uuid not null references clients(client_id) on delete cascade,
    question         text not null,
    answer           text not null,
    keywords         text[],
    is_active        boolean not null default true,
    created_at       timestamptz not null default now()
);

create index if not exists idx_faqs_client on faqs (client_id);

-- ─────────────────────────────────────────────
-- 7. جدول العملاء (Customers)
-- ─────────────────────────────────────────────
create table if not exists customers (
    customer_id      uuid primary key default gen_random_uuid(),
    client_id        uuid not null references clients(client_id) on delete cascade,
    customer_phone   text not null,        -- الرقم الموحد لكل القنوات
    platform         text default 'whatsapp'
                       check (platform in ('whatsapp','messenger','instagram')),
    customer_name    text,
    address          text,
    contact_phone    text,                 -- رقم مباشر للدليفري
    last_order       text,
    visit_count      int not null default 0,
    first_seen_at    timestamptz not null default now(),
    last_message_at  timestamptz,
    updated_at       timestamptz not null default now(),
    unique(client_id, customer_phone)
);

create index if not exists idx_customers_lookup on customers (client_id, customer_phone);

-- ─────────────────────────────────────────────
-- 8. جدول تفضيلات العملاء (Preferences)
-- ─────────────────────────────────────────────
create table if not exists customer_preferences (
    pref_id          uuid primary key default gen_random_uuid(),
    client_id        uuid not null references clients(client_id) on delete cascade,
    customer_phone   text not null,
    favorite_items   jsonb not null default '[]'::jsonb,  -- [{item, count}]
    order_count      int not null default 0,
    total_spent      numeric not null default 0,
    avg_order_value  numeric not null default 0,
    preferred_categories jsonb default '[]'::jsonb,
    last_order_date  timestamptz,
    updated_at       timestamptz not null default now(),
    unique(client_id, customer_phone)
);

-- ─────────────────────────────────────────────
-- 9. جدول الطلبات (Orders)
-- ─────────────────────────────────────────────
create table if not exists orders (
    order_id         uuid primary key default gen_random_uuid(),
    client_id        uuid not null references clients(client_id) on delete cascade,
    order_number     text not null unique,
    customer_phone   text not null,
    customer_name    text,
    order_details    text not null,
    address          text,
    phone            text,
    total            numeric not null,
    status           text not null default 'new'
                       check (status in ('new','confirmed','preparing','delivered','cancelled')),
    platform         text default 'whatsapp',
    is_addon         boolean not null default false,
    parent_order_id  uuid references orders(order_id),
    channel_id       uuid references channels(channel_id),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists idx_orders_client on orders (client_id);
create index if not exists idx_orders_customer on orders (client_id, customer_phone);
create index if not exists idx_orders_date on orders (client_id, created_at desc);

-- ─────────────────────────────────────────────
-- 10. جدول المحادثات (Conversation History)
-- لتتبع المحادثات الدائمة (وليس RAM فقط)
-- ─────────────────────────────────────────────
create table if not exists conversations (
    conv_id          uuid primary key default gen_random_uuid(),
    client_id        uuid not null references clients(client_id) on delete cascade,
    customer_phone   text not null,
    platform         text default 'whatsapp',
    messages         jsonb not null default '[]'::jsonb,  -- [{role, content, timestamp}]
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique(client_id, customer_phone)
);

create index if not exists idx_conversations_lookup on conversations (client_id, customer_phone);

-- ─────────────────────────────────────────────
-- 11. جدول التقارير اليومية
-- ─────────────────────────────────────────────
create table if not exists daily_reports (
    report_id        uuid primary key default gen_random_uuid(),
    client_id        uuid not null references clients(client_id) on delete cascade,
    report_date      date not null,
    total_orders     int not null default 0,
    total_revenue    numeric not null default 0,
    top_item         text,
    report_data      jsonb,
    created_at       timestamptz not null default now(),
    unique(client_id, report_date)
);

-- ─────────────────────────────────────────────
-- 12. جدول سجل الرسائل الواردة (Inbound Log)
-- للتتبع والتشخيص
-- ─────────────────────────────────────────────
create table if not exists inbound_log (
    log_id           uuid primary key default gen_random_uuid(),
    client_id        uuid,
    channel_id       uuid,
    platform         text,
    sender_phone     text,
    message_text     text,
    message_type     text,
    ai_reply         text,
    ai_latency_ms    int,
    created_at       timestamptz not null default now()
);

create index if not exists idx_inbound_date on inbound_log (created_at desc);

-- ─────────────────────────────────────────────
-- 13. جدول القوائم السوداء
-- ─────────────────────────────────────────────
create table if not exists blacklist (
    phone            text primary key,
    reason           text,
    blocked_at       timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 14. Trigger لتحديث updated_at تلقائياً
-- ─────────────────────────────────────────────
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger trg_clients_updated before update on clients
    for each row execute function update_updated_at_column();

create trigger trg_channels_updated before update on channels
    for each row execute function update_updated_at_column();

create trigger trg_customers_updated before update on customers
    for each row execute function update_updated_at_column();

create trigger trg_conversations_updated before update on conversations
    for each row execute function update_updated_at_column();

create trigger trg_orders_updated before update on orders
    for each row execute function update_updated_at_column();

-- ═══════════════════════════════════════════════
-- END OF SCHEMA
-- ═══════════════════════════════════════════════
