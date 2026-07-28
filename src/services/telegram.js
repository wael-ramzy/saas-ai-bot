const axios = require('axios');

const sendReceipt = async (telegramToken, telegramChatId, order, isAddon = false, parentOrderNumber = null) => {
    if (!telegramToken || !telegramChatId) return;

    const header = isAddon
        ? `➕ *إضافة على طلب ${parentOrderNumber}*`
        : `🆕 *طلب جديد*`;

    const text = `
${header}
=========================
👤 *الاسم:* ${order.name || 'غير محدد'}
📞 *الهاتف:* ${order.phone || 'غير محدد'}
📍 *العنوان:* ${order.address || 'غير محدد'}
-------------------------
🍣 *الطلب:*
${order.order || 'غير محدد'}
-------------------------
💰 *الإجمالي:* ${order.total || 'غير محدد'} جنيه
⏰ *الوقت:* ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
=========================
    `;

    try {
        await axios.post(
            `https://api.telegram.org/bot${telegramToken}/sendMessage`,
            { chat_id: telegramChatId, text, parse_mode: 'Markdown' }
        );
        console.log(`[✓] ${isAddon ? 'إضافة' : 'طلب'} أُرسل لتليجرام`);
    } catch (err) {
        console.error('خطأ تليجرام:', err.message);
    }
};

module.exports = { sendReceipt };