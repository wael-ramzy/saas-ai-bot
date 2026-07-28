// استخراج JSON الطلب من رد الـ AI
const parseOrder = (text) => {
    const match = text.match(/ORDER_JSON:(\{[^\n]+\})/);
    if (!match) return null;

    try {
        return JSON.parse(match[1]);
    } catch (e) {
        console.error('خطأ في تحليل JSON:', e.message);
        return null;
    }
};

// إزالة JSON من نص الرد
const cleanReply = (text) => {
    return text.replace(/ORDER_JSON:\{[^\n]+\}/, '').trim();
};

module.exports = { parseOrder, cleanReply };