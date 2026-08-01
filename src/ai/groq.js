const axios = require('axios');
const path = require('path');
require('dotenv').config({ 
    path: path.join(__dirname, '..', '..', 'config', '.env') 
});

const { buildMessages, updateMemory } = require('./memory');
const { parseOrder, cleanReply } = require('./parser');
const logger = require('../middleware/logger');

// استيراد القوالب السلوكية المتاحة
const basePrompt = require('./prompts/base');
const restaurantPrompt = require('./prompts/restaurant');
const clinicPrompt = require('./prompts/clinic');
const storePrompt = require('./prompts/store');

/**
 * 🔑 بناء البرومبت الديناميكي المخصص للعميل والنشاط من بيانات Supabase
 */
const buildSystemPromptForClient = (client, customerContext) => {
    const clientName   = client?.client_name || 'المتجر';
    const menuText     = client?.menu_text || 'البيانات والخدمات غير متوفرة حالياً';
    const pdfUrl       = client?.pdf_menu_url || '';
    const customPrompt = client?.system_prompt || '';
    const businessType = (client?.business_type || 'base').toLowerCase();

    // 1. تحديد دالة بناء البرومبت بحسب نوع النشاط
    let builderFn;

    switch (businessType) {
        case 'restaurant':
        case 'مطعم':
            builderFn = restaurantPrompt.buildRestaurantPrompt || restaurantPrompt.buildBasePrompt;
            break;
        case 'clinic':
        case 'عيادة':
            builderFn = clinicPrompt.buildClinicPrompt || clinicPrompt.buildBasePrompt;
            break;
        case 'store':
        case 'متجر':
            builderFn = storePrompt.buildStorePrompt || storePrompt.buildBasePrompt;
            break;
        default:
            builderFn = basePrompt.buildBasePrompt;
    }

    // احتياطي لو لم تكن الدالة متوفرة بنفس الاسم
    if (typeof builderFn !== 'function') {
        builderFn = basePrompt.buildBasePrompt;
    }

    // 2. توليد البرومبت الهيكلي للنشاط مع رابط الـ PDF وسياق العميل
    let finalPrompt = builderFn(clientName, menuText, customerContext, pdfUrl);

    // 3. إلحاق التعليمات المخصصة للتاجر إن وجِدت في Supabase
    if (customPrompt && customPrompt.trim()) {
        finalPrompt += `\n\n[تعليمات وسياسات خاصة جداً بهذا المكان]:\n${customPrompt.trim()}`;
    }

    return finalPrompt;
};

/**
 * دالة استدعاء الذكاء الاصطناعي ومعالجة الرد والطلبات
 */
const getAIResponse = async (chatId, userMessage, client = {}, customer = null) => {
    // 🔒 حماية: التأكد من وجود مفتاح API
    if (!process.env.GROQ_API_KEY) {
        logger.error('[Groq AI] مفتاح GROQ_API_KEY غير معرف في ملف الـ .env');
        return {
            reply: 'اعتذر منك يا فندم، النظام يمر بصيانة سريعة، يرجى المحاولة بعد قليل.',
            order: null
        };
    }

    // ── 1. بناء سياق بيانات الزبون (يتضمن هاتف الدليفري) ──
    let customerContext = '';

    if (customer) {
        const hasName      = customer.customer_name && customer.customer_name.trim();
        const hasAddress   = customer.address && customer.address.trim();
        const hasOrder     = customer.last_order && customer.last_order.trim();
        const contactPhone = customer.contact_phone || '';

        customerContext = `
[بيانات العميل الحالية]
الاسم: ${hasName ? customer.customer_name : 'غير معروف بعد'}
العنوان المسجل: ${hasAddress ? customer.address : 'لا يوجد عنوان مسجل بعد'}
رقم الهاتف المسجل للدليفري: ${contactPhone ? contactPhone : 'غير مسجل بعد'}
آخر طلب: ${hasOrder ? customer.last_order : 'لا يوجد طلبات سابقة'}
عدد الزيارات: ${customer.visit_count || 1}

حالة العميل: ${
            hasName && hasAddress && hasOrder ? 'مكتمل البيانات' :
            hasOrder && !hasAddress           ? 'قديم — عنوانه ناقص' :
            hasName  && !hasOrder             ? 'مسجل — بدون طلبات' :
                                                'جديد'
}`;
    } else {
        customerContext = `
[بيانات العميل الحالية]
الاسم: غير معروف بعد
العنوان المسجل: لا يوجد عنوان مسجل بعد
رقم الهاتف المسجل للدليفري: غير مسجل بعد
آخر طلب: لا يوجد طلبات سابقة
حالة العميل: جديد`;
    }

    // ── 2. تجهيز البرومبت الديناميكي وسلسلة المحادثة ──
    const systemPrompt = buildSystemPromptForClient(client, customerContext);
    const messages = buildMessages(chatId, systemPrompt, userMessage);

    let response;

    // ── 3. إرسال الطلب إلى Groq API ──
    try {
        response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.3-70b-versatile',
                messages,
                temperature: 0.4,
                max_tokens: 1000
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );
    } catch (err) {
        const statusCode = err.response?.status;
        const errorMessage = err.response?.data?.error?.message || err.message;

        logger.error('[Groq AI Error] فشل الاتصال بالذكاء الاصطناعي:', {
            chatId,
            status: statusCode || 'NETWORK_TIMEOUT',
            error: errorMessage
        });

        return { 
            reply: 'اعتذر منك يا فندم، حصل مشكلة بسيطة في الخدمة، لحظات وأكون معاك.', 
            order: null 
        };
    }

    // ── 4. تفكيك وتنظيف الرد ومخرج الـ JSON ──
    try {
        const fullReply = response.data?.choices?.[0]?.message?.content || '';

        const order = parseOrder(fullReply);
        const reply = cleanReply(fullReply);

        updateMemory(chatId, userMessage, fullReply);

        return { reply, order };
    } catch (parseErr) {
        logger.error('[Groq AI Error] خطأ أثناء تفكيك وتنظيف رد الذكاء الاصطناعي:', {
            chatId,
            error: parseErr.message
        });

        const rawContent = response.data?.choices?.[0]?.message?.content || '';
        return {
            reply: rawContent.replace(/```json[\s\S]*?```/gi, '').trim() || 'تمام يا فندم، تحت أمرك.',
            order: null
        };
    }
};

module.exports = { getAIResponse };