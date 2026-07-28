// ذاكرة مؤقتة في RAM — بتتمسح مع كل restart
// لكن بيانات الزبون الحقيقية محفوظة في Supabase
const sessions = {};

// ── جلب محادثة ──
const getSession = (chatId) => {
    if (!sessions[chatId]) {
        sessions[chatId] = [];
    }
    return sessions[chatId];
};

// ── إضافة رسالة للمحادثة ──
const addMessage = (chatId, role, content) => {
    if (!sessions[chatId]) {
        sessions[chatId] = [];
    }

    sessions[chatId].push({ role, content });

    // احتفظ بآخر 20 رسالة بس (10 جولات)
    if (sessions[chatId].length > 20) {
        sessions[chatId].splice(0, 2);
    }
};

// ── حقن سياق العميل القديم ──
const injectCustomerContext = (chatId, customer) => {
    if (!sessions[chatId]) {
        sessions[chatId] = [];
    }

    // لو مفيش سياق محقون قبل كده
    if (sessions[chatId].length === 0) {
        const context = `[بيانات العميل المحفوظة]
الاسم: ${customer.customer_name}
الهاتف: ${customer.customer_phone}
العنوان: ${customer.address}
آخر طلب: ${customer.last_order || 'لا يوجد'}
عدد الزيارات: ${customer.visit_count}
⚠️ عميل قديم — لا تطلب بياناته مرة أخرى`;

        sessions[chatId].push({ role: 'system', content: context });
    }
};

// ── مسح محادثة ──
const clearSession = (chatId) => {
    sessions[chatId] = [];
};

// ── إحصائيات ──
const getActiveSessionsCount = () => {
    return Object.keys(sessions).length;
};

module.exports = {
    getSession,
    addMessage,
    injectCustomerContext,
    clearSession,
    getActiveSessionsCount
};