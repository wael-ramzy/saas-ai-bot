/**
 * ═══════════════════════════════════════════════════════════════
 * INSTAGRAM WEBHOOK — استقبال رسائل إنستجرام (Direct)
 * ═══════════════════════════════════════════════════════════════
 * 
 * يستقبل Messages من Instagram Business Accounts:
 * - Verification (GET)
 * - Messages (POST) — يتضمن أيضاً Story Mentions و Comments
 * 
 * ─────────────────────────────────────────────────────────────
 */

const supabase = require('../db/supabase');
const { handleMessage } = require('../bot/router');
const { isBlacklisted } = require('../middleware/blacklist');
const logger = require('../middleware/logger');

/**
 * ═══ Verification — تأكيد الـ Webhook ═══
 */
const handleVerification = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
        logger.info('[Instagram Webhook] تم التحقق بنجاح');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
};

/**
 * ═══ استقبال الرسائل (POST) ═══
 */
const handleIncomingMessage = async (req, res) => {
    res.sendStatus(200); // تأكيد فوري

    const body = req.body;
    if (body.object !== 'instagram') return;

    const entries = body.entry || [];

    for (const entry of entries) {
        const messaging = entry.messaging || [];

        for (const event of messaging) {
            const senderId = event.sender?.id;
            const recipientId = event.recipient?.id;

            if (!senderId) continue;

            // ── فحص القائمة السوداء ──
            const blocked = await isBlacklisted(senderId);
            if (blocked) continue;

            // ── رسالة Direct نصية ──
            if (event.message && event.message.text && !event.message.is_echo) {
                const messageText = event.message.text;

                const context = {
                    platform: 'instagram',
                    channel: {
                        meta_ig_account_id: recipientId,
                        channel_type: 'instagram'
                    },
                    raw: event
                };

                handleMessage(senderId, messageText, context).catch(err => {
                    logger.error('[Instagram] خطأ:', { error: err.message });
                });
            }
        }
    }
};

module.exports = { handleVerification, handleIncomingMessage };
