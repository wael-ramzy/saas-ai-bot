const { getClientByPhone } = require('../db/clients');
const { getCustomer, saveCustomer } = require('../db/customers');
const { saveOrder, addOrderAddon, getLastOrder } = require('../db/orders');
const { getAIResponse } = require('../ai/groq');
const { injectCustomerContext } = require('../services/session');
const { sendReceipt } = require('../services/telegram');
const { isAllowed } = require('../middleware/rateLimiter');
const logger = require('../middleware/logger');

// آخر طلب لكل زبون في الذاكرة
const activeOrders = {};

// ── تنظيف الرقم وتوحيده ──
const cleanPhone = (raw) => {
    return raw
        .replace('@c.us', '')
        .replace('@lid', '')
        .replace('@s.whatsapp.net', '')
        .replace(/[^0-9]/g, '') // احتفظ بالأرقام بس
        .trim();
};

const handleMessage = async (msg, client) => {
    const chatId = msg.from;
    const phone = cleanPhone(chatId);

    // ── Rate Limiter ──
    if (!isAllowed(phone)) {
        logger.warn('Rate limit exceeded', { phone });
        return;
    }

    // ── جلب بيانات التاجر ──
    const merchantPhone = msg.to;
    const merchant = await getClientByPhone(merchantPhone);
    if (!merchant || !merchant.is_active) {
        logger.warn('تاجر غير موجود أو غير نشط', { merchantPhone });
        return;
    }

    // ── جلب بيانات الزبون ──
    const customer = await getCustomer(merchant.client_id, phone);

    // ── حقن سياق العميل القديم ──
    if (customer) {
        injectCustomerContext(chatId, customer);
    }

    // ── الرد بالـ AI ──
    const { reply, order } = await getAIResponse(chatId, msg.body, merchant, customer);

    if (!reply) return;

    // ── إرسال الرد دايماً ──
    await client.sendMessage(chatId, reply);
    logger.info('تم إرسال الرد', { phone });

    // ── لو طلب مكتمل ──
    if (order && order.name && order.order && order.total) {

        const address = order.address || (customer ? customer.address : '');
        const orderPhone = order.phone 
            ? order.phone.replace(/[^0-9]/g, '') 
            : phone;
        
        const cleanOrder = { 
            ...order, 
            phone: orderPhone, 
            address 
        };

        // ── هل ده إضافة ولا طلب جديد؟ ──
        let lastOrder = activeOrders[phone];
        if (!lastOrder) {
            lastOrder = await getLastOrder(merchant.client_id, phone);
        }

        const timeDiff = lastOrder?.created_at
            ? (Date.now() - new Date(lastOrder.created_at).getTime()) / 60000
            : 999;

        logger.info('فحص الطلب', { 
            lastOrder: lastOrder?.order_number || 'لا يوجد',
            timeDiff: Math.round(timeDiff) + ' دقيقة'
        });

        let savedOrder;

        if (lastOrder && timeDiff < 30) {
            // ── إضافة على طلب موجود ──
            savedOrder = await addOrderAddon(
                merchant.client_id,
                lastOrder.id,
                cleanOrder
            );

            await sendReceipt(
                merchant.telegram_chat_id ? process.env.TELEGRAM_BOT_TOKEN : null,
                merchant.telegram_chat_id,
                cleanOrder,
                true,
                lastOrder.order_number
            );

            logger.info('إضافة على طلب', { 
                phone, 
                parent: lastOrder.order_number 
            });

        } else {
            // ── طلب جديد ──
            savedOrder = await saveOrder(merchant.client_id, cleanOrder);

            await sendReceipt(
                merchant.telegram_chat_id ? process.env.TELEGRAM_BOT_TOKEN : null,
                merchant.telegram_chat_id,
                cleanOrder,
                false
            );

            logger.info('طلب جديد', { phone, order: order.order });
        }

        // احفظ في الذاكرة
        if (savedOrder) {
            activeOrders[phone] = savedOrder;
            setTimeout(() => delete activeOrders[phone], 3600000);
        }

        // حفظ بيانات الزبون
        await saveCustomer(
            merchant.client_id,
            phone,
            order.name,
            address,
            order.order
        );
    }
};

module.exports = { handleMessage };