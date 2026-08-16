/**
 * ═══════════════════════════════════════════════════════════════
 * AI ENGINE — محرك الذكاء الاصطناعي (Groq API)
 * ═══════════════════════════════════════════════════════════════
 * 
 * هذه الطبقة هي قلب النظام:
 * 1. تبني البرومبت الديناميكي حسب نوع النشاط
 * 2. تستدعي نظام RAG لاسترجاع الأصناف ذات الصلة
 * 3. تستدعي نظام التفضيلات
 * 4. ترسل للـ AI (Groq) وتستقبل الرد
 * 5. تفكك الـ ORDER_JSON
 * 
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');
const { retrieveContext } = require('../rag/retriever');
const { buildPreferencesContext } = require('../db/preferences');
const { parseOrder, cleanReply } = require('./parser');
const { getSession, addMessage } = require('../services/session');
const logger = require('../middleware/logger');

// ── استيراد القوالب السلوكية ──
const { buildBasePrompt } = require('./prompts/base');
const { buildRestaurantPrompt } = require('./prompts/restaurant');
const { buildClinicPrompt } = require('./prompts/clinic');
const { buildStorePrompt } = require('./prompts/store');
const { buildSalonPrompt } = require('./prompts/salon');

// ── مappable لأنواع الأنشطة ──
const PROMPT_BUILDERS = {
    'restaurant': buildRestaurantPrompt,
    'مطعم':       buildRestaurantPrompt,
    'clinic':     buildClinicPrompt,
    'عيادة':      buildClinicPrompt,
    'store':      buildStorePrompt,
    'متجر':       buildStorePrompt,
    'salon':      buildSalonPrompt,
    'gym':        buildBasePrompt,
    'other':      buildBasePrompt,
    'base':       buildBasePrompt
};

// ── إعدادات Groq ──
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_TEMPERATURE = parseFloat(process.env.GROQ_TEMPERATURE || '0.4');
const GROQ_MAX_TOKENS = parseInt(process.env.GROQ_MAX_TOKENS || '800');

/**
 * تحديد دالة بناء البرومبت حسب نوع النشاط
 */
const getPromptBuilder = (businessType) => {
    const type = (businessType || 'base').toLowerCase().trim();
    return PROMPT_BUILDERS[type] || buildBasePrompt;
};

/**
 * ═══ الدالة الرئيسية: معالجة رسالة الزبون ═══
 * 
 * @param {string} chatId - معرّف المحادثة (رقم الزبون)
 * @param {string} userMessage - نص الرسالة
 * @param {object} client - بيانات التاجر من Supabase
 * @param {object} customer - بيانات الزبون (إن وجد)
 * @param {object} preferences - تفضيلات الزبون (إن وجدت)
 * @returns {Promise<{reply: string, order: object|null}>}
 */
const getAIResponse = async (chatId, userMessage, client, customer = null, preferences = null) => {
    const startTime = Date.now();

    // ── 1. حماية: مفتاح API ──
    if (!process.env.GROQ_API_KEY) {
        logger.error('[AI] مفتاح GROQ_API_KEY غير معرّف');
        return {
            reply: 'عذراً، النظام يمر بصيانة مؤقتة. يرجى المحاولة بعد قليل.',
            order: null
        };
    }

    // ── 2. استدعاء نظام RAG (استرجاع الأصناف ذات الصلة) ──
    // هذا يوفر 70-80% من التوكنز مقارنة بتمرير المنيو كاملاً
    let ragContext = '';
    try {
        ragContext = await retrieveContext(client.client_id, userMessage);
    } catch (err) {
        logger.warn('[AI] فشل RAG — سنستخدم fallback:', { error: err.message });
        ragContext = '';
    }

    // ── 3. بناء سياق التفضيلات ──
    const preferencesContext = preferences
        ? buildPreferencesContext(preferences)
        : '';

    // ── 4. بناء البرومبت الديناميكي ──
    const promptBuilder = getPromptBuilder(client.business_type);
    const systemPrompt = promptBuilder(client, customer, ragContext, preferencesContext);

    // ── 5. بناء سلسلة الرسائل (System + History + User) ──
    const messages = [
        { role: 'system', content: systemPrompt },
        ...getSession(chatId),
        { role: 'user', content: userMessage }
    ];

    // ── 6. إرسال الطلب إلى Groq ──
    let response;
    try {
        response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: GROQ_MODEL,
                messages,
                temperature: GROQ_TEMPERATURE,
                max_tokens: GROQ_MAX_TOKENS
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            }
        );
    } catch (err) {
        logger.error('[AI] فشل الاتصال بـ Groq:', {
            status: err.response?.status,
            error: err.response?.data?.error?.message || err.message
        });
        return {
            reply: 'عذراً، حصل خطأ مؤقت في الخدمة. لحظات ونكون معاك.',
            order: null
        };
    }

    // ── 7. تفكيك الرد ──
    const latency = Date.now() - startTime;
    try {
        const fullReply = response.data?.choices?.[0]?.message?.content || '';
        const order = parseOrder(fullReply);
        const reply = cleanReply(fullReply);

        // تحديث الذاكرة المحلية
        addMessage(chatId, 'user', userMessage);
        addMessage(chatId, 'assistant', reply);

        logger.info('[AI] تم الرد بنجاح:', { latency_ms: latency, hasOrder: !!order });

        return { reply, order };
    } catch (err) {
        logger.error('[AI] خطأ في تفكيك الرد:', { error: err.message });
        const raw = response.data?.choices?.[0]?.message?.content || '';
        return {
            reply: raw.replace(/ORDER_JSON:\{[^\n]+\}/, '').trim() || 'تمام يا فندم.',
            order: null
        };
    }
};

module.exports = { getAIResponse };
