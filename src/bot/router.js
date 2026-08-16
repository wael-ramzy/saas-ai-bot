/**
 * ═══════════════════════════════════════════════════════════════
 * MESSAGE ROUTER — الموزّع الرئيسي للرسائل
 * ═══════════════════════════════════════════════════════════════
 * 
 * هذا هو القلب النابض للمنصة. يستقبل كل رسالة من أي قناة
 * (واتساب/ماسنجر/إنستجرام) ويعالجها:
 * 
 * 1. تحديد التاجر من القناة (Channel Resolution)
 * 2. جلب بيانات الزبون (Customer Lookup)
 * 3. جلب تفضيلات الزبون (Preferences)
 * 4. استدعاء الـ AI مع RAG + Context + Preferences
 * 5. إرسال الرد عبر القناة الصحيحة
 * 6. حفظ الطلب (إن وُجد ORDER_JSON)
 * 7. تحديث تفضيلات الزبون
 * 
 * ─────────────────────────────────────────────────────────────
 */

const supabase = require('../db/supabase');
const { getCustomer, saveCustomer } = require('../db/customers');
const { getPreferences, updatePreferences } = require('../db/preferences');
const { saveOrder, addOrderAddon, getLastOrder, generateOrderNumber } = require('../db/orders');
const { getAIResponse } = require('../ai/groq');
const { sendChannelMessage } = require('../meta/metaApi');
const { sendReceipt } = require('../services/telegram');
const { injectCustomerContext, getSession } = require('../services/session');
const { saveConversation, getConversation, addConversationMessage } = require('../db/conversations');
const { isAllowed } = require('../middleware/rateLimiter');
const { cleanPhone } = require('../db/clients');
const logger = require('../middleware/logger');

// ── الذاكرة المؤقتة (Last Order per customer) ──
const activeOrders = {};

/**
 * ═══ تحديد القناة والتاجر من الرسالة الواردة ═══
 * يبحث عن القناة النشطة المطابقة للمعرّف المستلم
 * 
 * @param {string} recipientId - الرقم/المعرّف الذي أُرسلت إليه الرسالة
 * @param {string} platform - نوع القناة
 * @returns {Promise<{channel: object, client: object}|null>}
 */
const resolveChannelAndClient = async (recipientId, platform) => {
    let query = supabase
        .from('channels')
        .select('*, clients(*)')
        .eq('is_active', true);

    // مطابقة حسب نوع القناة والمعرّف
    switch (platform) {
        case 'whatsapp':
            query = query.eq('meta_phone_id', recipientId);
            break;
        case 'messenger':
            query = query.eq('meta_page_id', recipientId);
            break;
        case 'instagram':
            query = query.eq('meta_ig_account_id', recipientId);
            break;
        default:
            query = query.eq('meta_phone_id', recipientId);
    }

    const { data, error } = await query.single();

    if (error || !data || !data.clients) {
        logger.warn('[Router] لم يتم العثور على قناة نشطة:', { recipientId, platform });
        return null;
    }

    return { channel: data, client: data.clients };
};

/**
 * ═══ تحديد التاجر من رقم الزبون المرسل (Fallback) ═══
 * في حالة الواتساب: الزبون يرسل لرقم التاجر
 * نبحث عن التاجر صاحب هذا الرقم
 */
const resolveClientByRecipient = async (recipientPhone) => {
    const cleanRecipient = cleanPhone(recipientPhone);

    const { data, error } = await supabase
        .from('channels')
        .select('*, clients(*)')
        .eq('channel_type', 'whatsapp')
        .eq('is_active', true)
        .eq('meta_phone_id', cleanRecipient)
        .single();

    if (error || !data || !data.clients) return null;
    return { channel: data, client: data.clients };
};

/**
 * ═══ المعالج الرئيسي: handleMessage ═══
 * 
 * @param {string} senderId - معرّف الزبون المرسل
 * @param {string} messageText - نص الرسالة
 * @param {object} context - سياق القناة {platform, channel, raw}
 */
const handleMessage = async (senderId, messageText, context = {}) => {
    const startTime = Date.now();
    const platform = context.platform || 'whatsapp';
    const channelData = context.channel || {};

    // ── Rate Limiting ──
    if (!isAllowed(senderId)) {
        logger.warn('[Router] تجاوز حد الرسائل:', { senderId });
        return;
    }

    // ── 1. تحديد القناة والتاجر ──
    let channel, client;

    if (channelData.meta_phone_id || channelData.meta_page_id || channelData.meta_ig_account_id) {
        // لدينا معلومات القناة من الـ webhook
        channel = channelData;
        const resolved = await resolveChannelAndClient(
            channel.meta_phone_id || channel.meta_page_id || channel.meta_ig_account_id,
            platform
        );
        if (resolved) {
            channel = resolved.channel;
            client = resolved.client;
        }
    }

    // Fallback: البحث من الرقم المستلم
    if (!client && context.raw?.to) {
        const resolved = await resolveClientByRecipient(context.raw.to);
        if (resolved) {
            channel = resolved.channel;
            client = resolved.client;
        }
    }

    // Fallback أخير: البحث من metadata في raw
    if (!client && context.raw?.metadata?.phone_number_id) {
        const resolved = await resolveChannelAndClient(context.raw.metadata.phone_number_id, platform);
        if (resolved) {
            channel = resolved.channel;
            client = resolved.client;
        }
    }

    if (!client || !channel) {
        logger.error('[Router] لم يتم تحديد التاجر:', { senderId, platform });
        return;
    }

    if (!client.is_active) {
        logger.warn('[Router] التاجر غير نشط:', { clientId: client.client_id });
        return;
    }

    // ── 2. جلب بيانات الزبون ──
    const customer = await getCustomer(client.client_id, senderId);

    // ── 3. جلب التفضيلات ──
    const preferences = await getPreferences(client.client_id, senderId);

    // ── 4. حقن سياق الزبون في الذاكرة المحلية ──
    if (customer) {
        injectCustomerContext(senderId, customer);
    }

    // ── 5. استدعاء الـ AI (مع RAG + تفضيلات) ──
    const { reply, order } = await getAIResponse(
        senderId,
        messageText,
        client,
        customer,
        preferences
    );

    if (!reply) return;

    // ── 6. إرسال الرد عبر القناة الصحيحة ──
    const sendSuccess = await sendChannelMessage(channel, senderId, reply);

    if (!sendSuccess) {
        logger.error('[Router] فشل إرسال الرد:', { senderId, platform });
    }

    // ── تسجيل في inbound_log ──
    const latency = Date.now() - startTime;
    supabase.from('inbound_log').insert([{
        client_id: client.client_id,
        channel_id: channel.channel_id,
        platform,
        sender_phone: senderId,
        message_text: messageText.slice(0, 500),
        ai_reply: reply ? reply.slice(0, 500) : null,
        ai_latency_ms: latency
    }]).then().catch(() => {});

    // ── تحديث last_message_at ──
    supabase.from('customers')
        .update({ last_message_at: new Date().toISOString() })
        .eq('client_id', client.client_id)
        .eq('customer_phone', senderId)
        .then().catch(() => {});

    // ── 7. معالجة الطلب (إن وُجد ORDER_JSON) ──
    if (order && order.name && order.order && order.total) {
        await processOrder(client, channel, senderId, customer, order, preferences);
    }
};

/**
 * ═══ معالجة الطلب وحفظه ═══
 */
const processOrder = async (client, channel, senderId, customer, order, preferences) => {
    const address = order.address || (customer ? customer.address : '');
    const orderPhone = order.phone
        ? order.phone.replace(/[^0-9]/g, '')
        : senderId;

    const cleanOrder = {
        ...order,
        phone: orderPhone,
        address
    };

    // ── تحديد: طلب جديد أم إضافة؟ ──
    let lastOrder = activeOrders[senderId];
    if (!lastOrder) {
        lastOrder = await getLastOrder(client.client_id, senderId);
    }

    const timeDiff = lastOrder?.created_at
        ? (Date.now() - new Date(lastOrder.created_at).getTime()) / 60000
        : 999;

    let savedOrder;
    const isAddon = lastOrder && timeDiff < 30;

    if (isAddon) {
        // إضافة على طلب موجود
        savedOrder = await addOrderAddon(client.client_id, lastOrder.order_id || lastOrder.id, cleanOrder);
        await sendReceipt(
            client.telegram_chat_id ? process.env.TELEGRAM_BOT_TOKEN : null,
            client.telegram_chat_id,
            cleanOrder,
            true,
            lastOrder.order_number
        );
    } else {
        // طلب جديد
        savedOrder = await saveOrder(client.client_id, cleanOrder);
        await sendReceipt(
            client.telegram_chat_id ? process.env.TELEGRAM_BOT_TOKEN : null,
            client.telegram_chat_id,
            cleanOrder,
            false
        );
    }

    // ── تحديث الذاكرة ──
    if (savedOrder) {
        activeOrders[senderId] = savedOrder;
        setTimeout(() => delete activeOrders[senderId], 3600000);
    }

    // ── حفظ/تحديث بيانات الزبون ──
    await saveCustomer(
        client.client_id,
        senderId,
        order.name,
        address,
        order.order
    );

    // ── تحديث التفضيلات ──
    await updatePreferences(client.client_id, senderId, order.order, order.total);

    logger.info('[Router] تم حفظ الطلب:', {
        client: client.client_name,
        phone: senderId,
        isAddon,
        total: order.total
    });
};

module.exports = { handleMessage };
