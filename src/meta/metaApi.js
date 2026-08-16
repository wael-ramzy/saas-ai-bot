/**
 * ═══════════════════════════════════════════════════════════════
 * META API — الطبقة الموحدة للاتصال بـ Meta Cloud APIs
 * ═══════════════════════════════════════════════════════════════
 * 
 * هذه الطبقة مسؤولة عن إرسال الرسائل عبر:
 * - WhatsApp Business Cloud API
 * - Messenger (Facebook Pages)
 * - Instagram (Direct Messages)
 * 
 * كل قناة لها endpoint مختلف:
 * - واتساب: POST /{phone_number_id}/messages
 * - ماسنجر: POST /me/messages
 * - إنستجرام: POST /{ig-user-id}/messages
 * 
 * التوكنات تُجلب من جدول channels في Supabase (ليست في .env)
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');
const logger = require('../middleware/logger');

const META_TIMEOUT = 15000;

/**
 * ═══ إرسال رسالة واتساب ═══
 * @param {string} phoneNumberId - Phone Number ID من جدول channels
 * @param {string} accessToken - Page Access Token من جدول channels
 * @param {string} to - رقم الزبون
 * @param {string} text - نص الرسالة
 */
const sendWhatsAppMessage = async (phoneNumberId, accessToken, to, text) => {
    if (!phoneNumberId || !accessToken) {
        logger.error('[Meta] بيانات قناة الواتساب ناقصة');
        return false;
    }

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
            {
                messaging_product: 'whatsapp',
                to: to.replace(/[^0-9]/g, ''),
                type: 'text',
                text: { body: text }
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: META_TIMEOUT
            }
        );

        logger.info('[Meta WhatsApp] تم الإرسال:', { to, messageId: response.data?.messages?.[0]?.id });
        return true;
    } catch (err) {
        logger.error('[Meta WhatsApp] فشل الإرسال:', {
            status: err.response?.status,
            error: err.response?.data?.error?.message || err.message
        });
        return false;
    }
};

/**
 * ═══ إرسال رسالة ماسنجر ═══
 * @param {string} accessToken - Page Access Token
 * @param {string} recipientId - PSID (Page-Scoped ID)
 * @param {string} text - نص الرسالة
 */
const sendMessengerMessage = async (accessToken, recipientId, text) => {
    if (!accessToken || !recipientId) {
        logger.error('[Meta] بيانات قناة الماسنجر ناقصة');
        return false;
    }

    try {
        const response = await axios.post(
            'https://graph.facebook.com/v21.0/me/messages',
            {
                recipient: { id: recipientId },
                message: { text }
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: META_TIMEOUT
            }
        );

        logger.info('[Meta Messenger] تم الإرسال:', { recipientId, messageId: response.data?.message_id });
        return true;
    } catch (err) {
        logger.error('[Meta Messenger] فشل الإرسال:', {
            status: err.response?.status,
            error: err.response?.data?.error?.message || err.message
        });
        return false;
    }
};

/**
 * ═══ إرسال رسالة إنستجرام (Direct) ═══
 * @param {string} accessToken - Access Token للحساب
 * @param {string} igUserId - Instagram User ID (من جدول channels)
 * @param {string} recipientId - Instagram User ID للمستلم
 * @param {string} text - نص الرسالة
 */
const sendInstagramMessage = async (accessToken, igUserId, recipientId, text) => {
    if (!accessToken || !igUserId || !recipientId) {
        logger.error('[Meta] بيانات قناة إنستجرام ناقصة');
        return false;
    }

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v21.0/${igUserId}/messages`,
            {
                recipient: { id: recipientId },
                message: { text }
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: META_TIMEOUT
            }
        );

        logger.info('[Meta Instagram] تم الإرسال:', { recipientId, messageId: response.data?.message_id });
        return true;
    } catch (err) {
        logger.error('[Meta Instagram] فشل الإرسال:', {
            status: err.response?.status,
            error: err.response?.data?.error?.message || err.message
        });
        return false;
    }
};

/**
 * ═══ دالة موحدة: إرسال رسالة حسب نوع القناة ═══
 * @param {object} channel - صف channel من Supabase
 * @param {string} recipient - معرّف المستلم (رقم أو PSID أو IG ID)
 * @param {string} text - نص الرسالة
 */
const sendChannelMessage = async (channel, recipient, text) => {
    switch (channel.channel_type) {
        case 'whatsapp':
            return sendWhatsAppMessage(channel.meta_phone_id, channel.meta_access_token, recipient, text);
        case 'messenger':
            return sendMessengerMessage(channel.meta_access_token, recipient, text);
        case 'instagram':
            return sendInstagramMessage(channel.meta_access_token, channel.meta_ig_account_id, recipient, text);
        default:
            logger.error('[Meta] نوع قناة غير معروف:', { type: channel.channel_type });
            return false;
    }
};

module.exports = {
    sendWhatsAppMessage,
    sendMessengerMessage,
    sendInstagramMessage,
    sendChannelMessage
};
