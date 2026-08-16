/**
 * ═══════════════════════════════════════════════════════════════
 * SEED — إضافة تاجر تجريبي مع قنواته ومنيوه
 * ═══════════════════════════════════════════════════════════════
 * 
 * التشغيل: node scripts/seed.js
 * 
 * هذا السكريبت يضيف:
 * 1. تاجر تجريبي (مطعم سوشي) في جدول clients
 * 2. قناة واتساب في جدول channels (بيانات Meta Cloud API)
 * 3. أصناف المنيو في جدول menu_items
 * 4. FAQ (أسئلة شائعة)
 * 5. فهرسة المنيو في نظام RAG (embeddings)
 */

require('dotenv').config({
    path: require('path').join(__dirname, '..', 'config', '.env')
});

const supabase = require('../src/db/supabase');
const { indexMenuItems } = require('../src/rag/retriever');

// ─────────────────────────────────────────────
// بيانات التاجر التجريبي
// ─────────────────────────────────────────────
const DEMO_CLIENT = {
    client_name: 'حسين سوشي',
    whatsapp_number: '201159030986',
    business_type: 'restaurant',
    system_prompt: 'المطعم مفتوح يومياً من 12 ظهراً حتى 2 فجراً. التوصيل مجاني للطلبات فوق 200 جنيه.',
    pdf_menu_url: '',
    telegram_chat_id: process.env.TELEGRAM_CHAT_ID || '',
    is_active: true
};

// ─────────────────────────────────────────────
// بيانات قناة الواتساب (من Meta Cloud API)
// ─────────────────────────────────────────────
// ⚠️ عدّل هذه البيانات ببياناتك الحقيقية من Meta Developer Dashboard
const DEMO_CHANNEL = {
    channel_type: 'whatsapp',
    meta_phone_id: process.env.DEMO_META_PHONE_ID || '123456789012345',
    meta_access_token: process.env.DEMO_META_ACCESS_TOKEN || 'your-meta-access-token',
    meta_verify_token: process.env.META_WEBHOOK_VERIFY_TOKEN,
    is_active: true
};

// ─────────────────────────────────────────────
// أصناف المنيو
// ─────────────────────────────────────────────
const DEMO_MENU = [
    { item_name: 'سوشي 12 قطعة', description: '12 قطعة سوشي متنوعة — سلمون وتونة وروبيان', category: 'سوشي', price: 180 },
    { item_name: 'سوشي 16 قطعة', description: '16 قطعة سوشي متنوعة — سلمون وتونة وروبيان', category: 'سوشي', price: 240 },
    { item_name: 'سوشي 24 قطعة', description: '24 قطعة سوشي متنوعة — سلمون وتونة وروبيان', category: 'سوشي', price: 360 },
    { item_name: 'سوشي 30 قطعة', description: '30 قطعة سوشي متنوعة — سلمون وتونة وروبيان', category: 'سوشي', price: 450 },
    { item_name: 'سوشي 40 قطعة', description: '40 قطعة سوشي متنوعة — سلمون وتونة وروبيان', category: 'سوشي', price: 600 },
    { item_name: 'سوشي 50 قطعة', description: '50 قطعة سوشي متنوعة — سلمون وتونة وروبيان', category: 'سوشي', price: 750 },
    { item_name: 'بوكس 50 قطعة مميز', description: '50 قطعة سوشي مميزة مع صوص خاص وأعواد خشبية', category: 'عروض', price: 599 },
    { item_name: 'نودلز خضار (2)', description: 'نودلز مع خضار مشكلة وصوص الصويا — حصة لشخصين', category: 'نودلز', price: 200 },
    { item_name: 'نودلز فراخ (2)', description: 'نودلز مع فراخ مشوية وصوص خاص — حصة لشخصين', category: 'نودلز', price: 220 },
    { item_name: 'نودلز جمبري (2)', description: 'نودلز مع جمبري طازج — حصة لشخصين', category: 'نودلز', price: 260 },
    { item_name: 'نودلز سيفود (2)', description: 'نودلز مع ميكس مأكولات بحرية — حصة لشخصين', category: 'نودلز', price: 310 }
];

// ─────────────────────────────────────────────
// أسئلة شائعة
// ─────────────────────────────────────────────
const DEMO_FAQS = [
    { question: 'كام سعر التوصيل؟', answer: 'التوصيل مجاني للطلبات فوق 200 جنيه، وبخلاف ذلك 20 جنيه.', keywords: ['توصيل', 'دليفري', 'سعر', 'فلوس'] },
    { question: 'إيه مواعيد العمل؟', answer: 'المطعم مفتوح يومياً من 12 ظهراً حتى 2 فجراً.', keywords: ['مواعيد', 'مفتوح', 'ساعات', 'وقت'] },
    { question: 'مين أقل طلب؟', answer: 'أقل طلب للتوصيل هو 50 جنيه.', keywords: ['أقل', 'حد', 'طلب', 'مين'] }
];

/**
 * التشغيل الرئيسي
 */
const run = async () => {
    console.log('🚀 بدء إضافة التاجر التجريبي...\n');

    // ── 1. إضافة التاجر ──
    console.log('1️⃣  إضافة التاجر...');
    const { data: client, error: clientError } = await supabase
        .from('clients')
        .upsert([DEMO_CLIENT], { onConflict: 'whatsapp_number' })
        .select()
        .single();

    if (clientError) {
        console.error('❌ فشل إضافة التاجر:', clientError.message);
        return;
    }
    console.log(`✅ تم إنشاء/تحديث التاجر: ${client.client_name} (ID: ${client.client_id})`);

    // ── 2. إضافة قناة الواتساب ──
    console.log('2️⃣  إضافة قناة الواتساب...');
    const { error: channelError } = await supabase
        .from('channels')
        .upsert([{
            ...DEMO_CHANNEL,
            client_id: client.client_id
        }], {
            onConflict: 'client_id,channel_type',
            ignoreDuplicates: false
        });

    if (channelError) {
        console.error('❌ فشل إضافة القناة:', channelError.message);
    } else {
        console.log('✅ تم إنشاء قناة الواتساب');
    }

    // ── 3. إضافة أصناف المنيو ──
    console.log('3️⃣  إضافة أصناف المنيو...');
    const menuRows = DEMO_MENU.map(item => ({
        ...item,
        client_id: client.client_id,
        item_text: `${item.item_name} — ${item.description}`,
        is_available: true,
        sort_order: DEMO_MENU.indexOf(item)
    }));

    const { error: menuError } = await supabase
        .from('menu_items')
        .upsert(menuRows, {
            onConflict: 'client_id,item_name',
            ignoreDuplicates: false
        });

    if (menuError) {
        console.error('❌ فشل إضافة المنيو:', menuError.message);
    } else {
        console.log(`✅ تم إضافة ${DEMO_MENU.length} صنف`);
    }

    // ── 4. إضافة FAQs ──
    console.log('4️⃣  إضافة الأسئلة الشائعة...');
    const faqRows = DEMO_FAQS.map(faq => ({
        ...faq,
        client_id: client.client_id
    }));

    const { error: faqError } = await supabase
        .from('faqs')
        .upsert(faqRows, {
            onConflict: 'client_id,question',
            ignoreDuplicates: false
        });

    if (faqError) {
        console.error('❌ فشل إضافة FAQs:', faqError.message);
    } else {
        console.log(`✅ تم إضافة ${DEMO_FAQS.length} سؤال شائع`);
    }

    // ── 5. فهرسة المنيو في RAG ──
    console.log('5️⃣  فهرسة المنيو في نظام RAG (Embeddings)...');
    try {
        const result = await indexMenuItems(client.client_id, DEMO_MENU);
        console.log(`✅ تم فهرسة ${result.success}/${DEMO_MENU.length} صنف`);
    } catch (err) {
        console.error('❌ فشل فهرسة RAG:', err.message);
        console.log('⚠️  يمكنك تشغيل الفهرسة لاحقاً عبر: POST /api/menu/index');
    }

    console.log('\n🎉 تم الانتهاء!');
    console.log('\n📋 Webhooks:');
    console.log(`   WhatsApp:  /webhook/whatsapp`);
    console.log(`   Messenger: /webhook/messenger`);
    console.log(`   Instagram: /webhook/instagram`);
    console.log(`   Onboard:   /api/onboard`);

    process.exit(0);
};

run().catch(err => {
    console.error('❌ خطأ حرج:', err.message);
    process.exit(1);
});
