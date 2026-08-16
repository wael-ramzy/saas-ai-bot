/**
 * ═══════════════════════════════════════════════════════════════
 * WHATSAPP WEBHOOK — استقبال رسائل الواتساب من Meta
 * ═══════════════════════════════════════════════════════════════
 * 
 * هذه الطبقة تستقبل Webhooks من WhatsApp Cloud API:
 * 1. Verification (GET) — عند إعداد الـ webhook في Meta
 * 2. Messages (POST) — عند وصول رسالة من زبون
 * 
 * ─────────────────────────────────────────────────────────────
 */

const supabase = require('../db/supabase');
const { handleMessage } = require('../bot/router');
const { isBlacklisted } = require('../middleware/blacklist');
const logger = require('../middleware/logger');

/**
 * ═══ Verification — تأكيد الـ Webhook (GET) ═══
 * Meta ترسل هذا الطلب عند إعداد الـ webhook للتأكد من الملكية
 */
const handleVerification = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
        logger.info('[WhatsApp Webhook] تم التحقق بنجاح');
        res.status(200).send(challenge);
    } else {
        logger.warn('[WhatsApp Webhook] فشل التحقق:', { mode, token: token ? 'exists' : 'missing' });
        res.sendStatus(403);
    }
};

/**
 * ═══ استقبال الرسائل (POST) ═══
 * Meta ترسل هنا عند وصول أي رسالة على رقم التاجر
 */
const handleIncomingMessage = async (req, res) => {
    // ── تأكيد الاستلام فوراً (Meta يتطلب 200 في أقل من 20 ثانية) ──
    res.sendStatus(200);

    const body = req.body;

    // ── تجاهل حالة الحساب (account updates) ──
    if (body.object !== 'whatsapp_business_account') return;

    const entries = body.entry || [];

    for (const entry of entries) {
        const changes = entry.changes || [];

        for (const change of changes) {
            if (change.field !== 'messages') continue;

            const value = change.value || {};
            const contacts = value.contacts || [];
            const messages = value.messages || [];
            const metadata = value.metadata || {};

            // ── Phone Number ID الذي استقبل الرسالة ──
            const phoneId = metadata.phone_number_id || '';

            if (messages.length === 0) continue;

            for (const msg of messages) {
                // تجاهل الرسائل المرسلة من البوت نفسه
                if (msg.from_me) continue;

                // دعم الأنواع النصية فقط حالياً
                if (msg.type !== 'text') {
                    logger.warn('[WhatsApp] رسالة غير نصية:', { type: msg.type });
                    continue;
                }

                const senderPhone = msg.from;
                const messageText = msg.text?.body || '';

                // ── فحص القائمة السوداء ──
                const blocked = await isBlacklisted(senderPhone);
                if (blocked) {
                    logger.warn('[WhatsApp] رقم محظور:', { phone: senderPhone });
                    continue;
                }

                // ── معالجة الرسالة ──
                const context = {
                    platform: 'whatsapp',
                    channel: {
                        meta_phone_id: phoneId,
                        channel_type: 'whatsapp'
                    },
                    raw: msg
                };

                handleMessage(msg.from, messageText, context).catch(err => {
                    logger.error('[WhatsApp] خطأ في معالجة الرسالة:', { error: err.message });
                });
            }
        }
    }
};

module.exports = { handleVerification, handleIncomingMessage };
