/**
 * ═══════════════════════════════════════════════════════════════
 * RETRIEVER — طبقة الاسترجاع الذكي (Semantic Search)
 * ═══════════════════════════════════════════════════════════════
 * 
 * هذه الطبقة مسؤولة عن:
 * 1. البحث الدلالي (Semantic Search) في المنيو/الخدمات
 *    مثال: الزبون يسأل "عندكم أكل بحري؟" 
 *    → النظام يسترجع "جمبري مشوي، سمك فيليه، كاليماري"
 * 
 * 2. البحث النصي (Keyword Search) كطبقة أولى سريعة
 *    مثال: الزبون يقول "بكل كبة" → تطابق مباشر
 * 
 * 3. دمج النتائج (Hybrid Search) لتقديم أفضل سياق للـ AI
 * 
 * النتيجة: بدل ما نمرر 50 صنف في البرومبت، نمرر 3-5 أصناف فقط
 * → توفير هائل في التوكنز (حوالي 70-80%)
 * ─────────────────────────────────────────────────────────────
 */

const supabase = require('../db/supabase');
const { embedText } = require('./embedder');
const logger = require('../middleware/logger');

// ── إعدادات الاسترجاع ──
const RETRIEVAL_CONFIG = {
    VECTOR_TOP_K: 5,          // عدد نتائج البحث المتجهي
    KEYWORD_TOP_K: 5,         // عدد نتائج البحث النصي
    MERGED_TOP_K: 6,          // النتيجة النهائية بعد الدمج
    SIMILARITY_THRESHOLD: 0.35 // حد أدنى للتشابه (0 = مختلف تماماً، 1 = مطابق)
};

/**
 * البحث المتجهي (Semantic/Vector Search)
 * يستخدم pgvector cosine similarity
 */
const vectorSearch = async (clientId, queryEmbedding, topK = RETRIEVAL_CONFIG.VECTOR_TOP_K) => {
    const { data, error } = await supabase
        .rpc('match_embeddings', {
            query_embedding: queryEmbedding,
            match_client_id: clientId,
            match_count: topK,
            min_similarity: RETRIEVAL_CONFIG.SIMILARITY_THRESHOLD
        });

    if (error) {
        logger.error('[Retriever] خطأ في البحث المتجهي:', { error: error.message });
        return [];
    }

    return (data || []).map(row => ({
        item_id: row.item_id,
        content_text: row.content_text,
        content_type: row.content_type,
        similarity: row.similarity
    }));
};

/**
 * البحث النصي (Keyword Search) — تطابق مباشر
 * أسرع من المتجهي ويفيد في الحالات المباشرة
 */
const keywordSearch = async (clientId, queryText, topK = RETRIEVAL_CONFIG.KEYWORD_TOP_K) => {
    if (!queryText || queryText.trim().length < 2) return [];

    const words = queryText
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length >= 2);

    if (words.length === 0) return [];

    // البحث في أسماء الأصناف والكلمات المفتاحية
    const { data, error } = await supabase
        .from('menu_items')
        .select('item_id, item_name, item_text, category, price, keywords')
        .eq('client_id', clientId)
        .eq('is_available', true)
        .or(
            words.map(w => `item_name.ilike.%${w}%,item_text.ilike.%${w}%,category.ilike.%${w}%`).join(',')
        )
        .limit(topK);

    if (error) {
        logger.error('[Retriever] خطأ في البحث النصي:', { error: error.message });
        return [];
    }

    return (data || []).map(row => ({
        item_id: row.item_id,
        content_text: `${row.item_name}${row.category ? ` (${row.category})` : ''}: ${row.item_text}${row.price ? ` — ${row.price} جنيه` : ''}`,
        content_type: 'menu_item',
        similarity: 1.0 // تطابق نصي مباشر
    }));
};

/**
 * البحث عن FAQs ذات صلة
 */
const faqSearch = async (clientId, queryText, topK = 3) => {
    if (!queryText || queryText.trim().length < 3) return [];

    const words = queryText.trim().toLowerCase().split(/\s+/).filter(w => w.length >= 2);
    if (words.length === 0) return [];

    const { data, error } = await supabase
        .from('faqs')
        .select('faq_id, question, answer')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .or(
            words.map(w => `question.ilike.%${w}%,answer.ilike.%${w}%`).join(',')
        )
        .limit(topK);

    if (error) return [];

    return (data || []).map(row => ({
        item_id: row.faq_id,
        content_text: `سؤال: ${row.question}\nجواب: ${row.answer}`,
        content_type: 'faq',
        similarity: 1.0
    }));
};

/**
 * دمج النتائج المتجهية والنصية (Hybrid Search)
 * نأخذ أفضل النتائج من كلا الطريقتين ونزيل التكرار
 */
const mergeResults = (vectorResults, keywordResults, faqResults, topK = RETRIEVAL_CONFIG.MERGED_TOP_K) => {
    const merged = new Map();

    // الأولوية للنتائج النصية المباشرة (similarity = 1.0)
    for (const item of [...vectorResults, ...keywordResults, ...faqResults]) {
        const key = `${item.content_type}:${item.item_id || item.content_text.slice(0, 50)}`;
        if (!merged.has(key) || item.similarity > merged.get(key).similarity) {
            merged.set(key, item);
        }
    }

    // ترتيب حسب التشابه
    return [...merged.values()]
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
};

/**
 * ═══ الدالة الرئيسية: الاسترجاع الكامل ═══
 * تستقبل رسالة الزبون وتعيد السياق المناسب للبرومبت
 */
const retrieveContext = async (clientId, userMessage) => {
    if (!userMessage || !userMessage.trim()) return '';

    // 1. توليد embedding للرسالة
    const queryEmbedding = await embedText(userMessage);

    // 2. البحث النصي (سريع)
    const keywordResults = await keywordSearch(clientId, userMessage);

    // 3. البحث المتجهي (دقيق) — فقط إذا نجح التوليد
    let vectorResults = [];
    if (queryEmbedding) {
        vectorResults = await vectorSearch(clientId, queryEmbedding);
    } else {
        logger.warn('[Retriever] فشل embedding — الاعتماد على البحث النصي فقط');
    }

    // 4. البحث في FAQs
    const faqResults = await faqSearch(clientId, userMessage);

    // 5. دمج النتائج
    const results = mergeResults(vectorResults, keywordResults, faqResults);

    if (results.length === 0) return '';

    // 6. بناء نص السياق
    return formatRetrievedContext(results);
};

/**
 * تحويل النتائج المسترجعة إلى نص مُهيكل للبرومبت
 */
const formatRetrievedContext = (results) => {
    if (results.length === 0) return '';

    const menuItems = results.filter(r => r.content_type === 'menu_item');
    const faqs = results.filter(r => r.content_type === 'faq');
    const others = results.filter(r => !['menu_item', 'faq'].includes(r.content_type));

    let context = '';

    if (menuItems.length > 0) {
        context += '\n━━━━━━━━━━━━━━━━━━━━━━━━\n📋 أصناف ذات صلة بسؤال العميل (من المنيو):\n━━━━━━━━━━━━━━━━━━━━━━━━\n';
        menuItems.forEach((item, i) => {
            context += `${i + 1}. ${item.content_text}\n`;
        });
    }

    if (faqs.length > 0) {
        context += '\n━━━━━━━━━━━━━━━━━━━━━━━━\n❓ إجابات ذات صلة من الأسئلة الشائعة:\n━━━━━━━━━━━━━━━━━━━━━━━━\n';
        faqs.forEach((faq, i) => {
            context += `${faq.content_text}\n`;
        });
    }

    if (others.length > 0) {
        context += '\n━━━━━━━━━━━━━━━━━━━━━━━━\n📌 معلومات إضافية ذات صلة:\n━━━━━━━━━━━━━━━━━━━━━━━━\n';
        others.forEach((item, i) => {
            context += `${i + 1}. ${item.content_text}\n`;
        });
    }

    return context;
};

/**
 * ═══ Indexing — إضافة/تحديث أصناف المنيو في النظام ═══
 * تُستخدم عند إضافة تاجر جديد أو تحديث المنيو
 */
const indexMenuItems = async (clientId, items) => {
    if (!items || items.length === 0) return { success: 0, failed: 0 };

    // 1. تجهيز النصوص
    const texts = items.map(item => 
        `${item.name || item.item_name} ${item.category ? `(${item.category})` : ''}: ${item.description || item.item_text} ${item.price ? `— السعر ${item.price}` : ''}`
    );

    // 2. توليد embeddings
    const embeddings = await embedBatch(texts);
    if (!embeddings) {
        logger.error('[Indexer] فشل في توليد embeddings للمنيو');
        return { success: 0, failed: items.length };
    }

    let success = 0;
    let failed = 0;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const embedding = embeddings[i];

        if (!embedding) { failed++; continue; }

        // إدراج الصنف في menu_items
        const { data: menuItem } = await supabase
            .from('menu_items')
            .upsert({
                client_id: clientId,
                item_name: item.name || item.item_name,
                item_text: item.description || item.item_text,
                category: item.category || null,
                price: item.price || null,
                keywords: item.keywords || []
            }, {
                onConflict: 'client_id,item_name',
                ignoreDuplicates: false
            })
            .select()
            .single();

        if (!menuItem) { failed++; continue; }

        // إدراج الـ embedding في embeddings_store
        const { error } = await supabase
            .from('embeddings_store')
            .upsert({
                client_id: clientId,
                item_id: menuItem.item_id,
                content_type: 'menu_item',
                content_text: texts[i],
                embedding: embedding
            }, {
                onConflict: 'client_id,item_id,content_type',
                ignoreDuplicates: false
            });

        if (error) {
            logger.error('[Indexer] فشل في حفظ embedding:', { error: error.message });
            failed++;
        } else {
            success++;
        }
    }

    logger.info('[Indexer] تم فهرسة المنيو:', { clientId, success, failed });
    return { success, failed };
};

module.exports = {
    retrieveContext,
    vectorSearch,
    keywordSearch,
    faqSearch,
    indexMenuItems,
    formatRetrievedContext
};
