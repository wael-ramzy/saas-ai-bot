/**
 * ═══════════════════════════════════════════════════════════════
 * MESSENGER WEBHOOK — استقبال رسائل ماسنجر من Meta
 * ═══════════════════════════════════════════════════════════════
 * 
 * يستقبل Messages من Facebook Pages عبر Graph API:
 * - Verification (GET)
 * - Messages (POST) — يتضمن أيضاً Messaging Referrals (من الإعلانات)
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
        logger.info('[Messenger Webhook] تم التحقق بنجاح');
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
    if (body.object !== 'page') return;

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

            // ── رسالة نصية ──
            if (event.message && event.message.text && !event.message.is_echo) {
                const messageText = event.message.text;

                const context = {
                    platform: 'messenger',
                    channel: {
                        meta_page_id: recipientId,
                        channel_type: 'messenger'
                    },
                    raw: event
                };

                handleMessage(senderId, messageText, context).catch(err => {
                    logger.error('[Messenger] خطأ:', { error: err.message });
                });
            }

            // ── Referral من إعلان (Ad Click) ──
            // عند الضغط على إعلان → يفتح محادثة مع referral
            if (event.referral && event.referral.type) {
                const refType = event.referral.type;
                const refSource = event.referral.source || '';

                logger.info('[Messenger] Referral من إعلان:', {
                    type: refType,
                    source: refSource,
                    sender: senderId
                });

                // بدء محادثة ترحيبية
                const context = {
                    platform: 'messenger',
                    channel: {
                        meta_page_id: recipientId,
                        channel_type: 'messenger'
                    },
                    referral: event.referral
                };

                const greeting = refType === 'OPEN_THREAD' || refType === 'ADS'
                    ? 'أهلاً بيك! 👋 شوفنا إنك مهتم بإعلاناتنا. كيف أقدر أساعدك؟ 😊'
                    : 'أهلاً بيك! كيف أقدر أساعدك اليوم؟ 😊';

                handleMessage(senderId, greeting, context).catch(err => {
                    logger.error('[Messenger] خطأ في ref:', { error: err.message });
                });
            }
        }
    }
};

module.exports = { handleVerification, handleIncomingMessage };
