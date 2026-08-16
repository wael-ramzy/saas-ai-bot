/**
 * ═══════════════════════════════════════════════════════════════
 * SESSION — الذاكرة المؤقتة للمحادثات (RAM Cache)
 * ═══════════════════════════════════════════════════════════════
 * 
 * تحتفظ بآخر 20 رسالة لكل محادثة في الذاكرة
 * لسرعة الاستجابة (بدون استعلامات DB لكل رسالة)
 * 
 * المحادثات الدائمة محفوظة في جدول conversations في Supabase
 * ─────────────────────────────────────────────────────────────
 */

const sessions = {};

/**
 * جلب سجل المحادثة
 * @param {string} chatId - معرّف الزبون
 * @returns {Array<{role: string, content: string}>}
 */
const getSession = (chatId) => {
    if (!sessions[chatId]) {
        sessions[chatId] = [];
    }
    return sessions[chatId];
};

/**
 * إضافة رسالة للسجل
 * يحتفظ بآخر 20 رسالة (10 جولات محادثة)
 */
const addMessage = (chatId, role, content) => {
    if (!sessions[chatId]) {
        sessions[chatId] = [];
    }

    sessions[chatId].push({ role, content });

    // الاحتفاظ بآخر 20 رسالة فقط
    if (sessions[chatId].length > 20) {
        sessions[chatId].splice(0, 2);
    }
};

/**
 * حقن سياق العميل القديم (نظام message واحد في بداية السجل)
 */
const injectCustomerContext = (chatId, customer) => {
    if (!sessions[chatId]) {
        sessions[chatId] = [];
    }

    // حقن مرة واحدة فقط
    if (sessions[chatId].length === 0) {
        const context = `[بيانات العميل المحفوظة]
الاسم: ${customer.customer_name || 'غير معروف'}
الهاتف: ${customer.customer_phone || ''}
العنوان: ${customer.address || 'لا يوجد'}
آخر طلب: ${customer.last_order || 'لا يوجد'}
عدد الزيارات: ${customer.visit_count || 1}
⚠️ عميل قديم — لا تطلب بياناته مرة أخرى`;

        sessions[chatId].push({ role: 'system', content: context });
    }
};

/**
 * مسح محادثة
 */
const clearSession = (chatId) => {
    sessions[chatId] = [];
};

/**
 * عدد الجلسات النشطة
 */
const getActiveSessionsCount = () => {
    return Object.keys(sessions).length;
};

/**
 * تنظيف الجلسات القديمة (اختياري — عند الحاجة لتحرير الذاكرة)
 */
const cleanupOldSessions = (maxAgeMs = 3600000) => {
    const now = Date.now();
    for (const chatId of Object.keys(sessions)) {
        if (sessions[chatId]._lastActive && now - sessions[chatId]._lastActive > maxAgeMs) {
            delete sessions[chatId];
        }
    }
};

module.exports = {
    getSession,
    addMessage,
    injectCustomerContext,
    clearSession,
    getActiveSessionsCount,
    cleanupOldSessions
};
