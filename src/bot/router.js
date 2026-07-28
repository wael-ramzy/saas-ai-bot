const { getClientByPhone } = require('../db/clients');
const { getCustomer, saveCustomer } = require('../db/customers');
const { saveOrder, addOrderAddon, getLastOrder } = require('../db/orders');
const { getAIResponse } = require('../ai/groq');
const { detectIntent } = require('../ai/intent'); // دمج فحص النية
const { getCustomerIdentifier } = require('../ai/fingerprint'); // دمج البصمة
const { injectCustomerContext } = require('../services/session');
const { sendReceipt } = require('../services/telegram');
const { isAllowed } = require('../middleware/rateLimiter');
const logger = require('../middleware/logger');

// آخر طلب لكل زبون في الذاكرة
const activeOrders = {};

// ── تنظيف الرقم وتوحيده ──
const cleanPhone = (raw) => {
    if (!raw) return '';
    return raw
        .replace('@c.us', '')
        .replace('@lid', '')
        .replace('@s.whatsapp.net', '')
        .replace(/[^0-9]/g, '') // احتفظ بالأرقام فقط
        .trim();
};

const handleMessage = async (msg, client) => {
    // ── حماية المعالجة بـ try/catch لمنع انهيار النظام ──
    try {
        const chatId = msg.from;
        
        // ── 1. استخدام البصمة لتحديد الزبون (حل مشكلة @lid والواتساب) ──
        const phone = getCustomerIdentifier ? getCustomerIdentifier(msg) : cleanPhone(chatId);

        if (!phone) {
            logger.warn('لم يتم التعرف على رقم الزبون', { chatId });
            return;
        }

        // ── 2. Rate Limiter ──
        if (!isAllowed(phone)) {
            logger.warn('تجاوز حد الرسائل (Rate limit exceeded)', { phone });
            return;
        }

        // ── 3. جلب بيانات التاجر ──
        const merchantPhone = cleanPhone(msg.to);
        const merchant = await getClientByPhone(merchantPhone);
        if (!merchant || !merchant.is_active) {
            logger.warn('تاجر غير موجود أو غير نشط', { merchantPhone });
            return;
        }

        // ── 4. جلب بيانات الزبون ──
        const customer = await getCustomer(merchant.client_id, phone);

        // ── 5. حقن سياق العميل القديم ──
        if (customer) {
            injectCustomerContext(chatId, customer);
        }

        // ── 6. الرد بالـ AI ──
        const { reply, order } = await getAIResponse(chatId, msg.body, merchant, customer);

        if (!reply) return;

        // ── 7. إرسال الرد للزبون ──
        await client.sendMessage(chatId, reply);
        logger.info('تم إرسال الرد بنجاح', { phone });

        // ── 8. معالجة الطلب في حال وجوده ──
        if (order && order.name && order.order && order.total) {

            const address = order.address || (customer ? customer.address : '');
            const orderPhone = order.phone 
                ? cleanPhone(order.phone) 
                : phone;
            
            const cleanOrder = { 
                ...order, 
                phone: orderPhone, 
                address 
            };

            // جلب آخر طلب
            let lastOrder = activeOrders[phone];
            if (!lastOrder) {
                lastOrder = await getLastOrder(merchant.client_id, phone);
            }

            const timeDiff = lastOrder?.created_at
                ? (Date.now() - new Date(lastOrder.created_at).getTime()) / 60000
                : 999;

            // ── 9. تحديد النية (Intent) بذكاء ──
            const intent = detectIntent 
                ? await detectIntent(msg.body, lastOrder, timeDiff) 
                : (timeDiff < 30 ? 'ADDON' : 'NEW');

            logger.info('فحص الطلب والنية', { 
                lastOrder: lastOrder?.order_number || 'لا يوجد',
                timeDiff: Math.round(timeDiff) + ' دقيقة',
                intent
            });

            let savedOrder;

            // إذا كانت النية إضافة على طلب قائم وتم خلال 30 دقيقة
            if (lastOrder && timeDiff < 30 && intent === 'ADDON') {
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

                logger.info('إضافة على طلب قائم', { 
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

            // حفظ الطلب في الذاكرة المؤقتة
            if (savedOrder) {
                activeOrders[phone] = savedOrder;
                setTimeout(() => delete activeOrders[phone], 3600000); // إزالة بعد ساعة
            }

            // حفظ/تحديث بيانات الزبون
            await saveCustomer(
                merchant.client_id,
                phone,
                order.name,
                address,
                order.order
            );
        }

    } catch (err) {
        logger.error('خطأ حرج أثناء معالجة الرسالة', { 
            error: err.message, 
            stack: err.stack 
        });
    }
};

module.exports = { handleMessage };