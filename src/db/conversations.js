/**
 * ═══════════════════════════════════════════════════════════════
 * CONVERSATIONS — تتبع المحادثات في قاعدة البيانات
 * ═══════════════════════════════════════════════════════════════
 * 
 * يكمّل الذاكرة المحلية (session.js) بتتبع دائم:
 * - حفظ المحادثات بالكامل (وليس آخر 20 رسالة فقط)
 * - استرجاع المحادثات السابقة بعد restart
 * - تحليل المحادثات لاحقاً (Quality/Analytics)
 */

const supabase = require('./supabase');

/**
 * حفظ أو تحديث محادثة
 */
const saveConversation = async (clientId, customerPhone, platform = 'whatsapp', messages = []) => {
    const { data, error } = await supabase
        .from('conversations')
        .upsert({
            client_id: clientId,
            customer_phone: customerPhone,
            platform,
            messages,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'client_id,customer_phone',
            ignoreDuplicates: false
        })
        .select()
        .single();

    if (error) {
        console.error('[Conversations] خطأ في الحفظ:', error.message);
        return null;
    }
    return data;
};

/**
 * جلب محادثة
 */
const getConversation = async (clientId, customerPhone) => {
    const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('client_id', clientId)
        .eq('customer_phone', customerPhone)
        .single();

    if (error) return null;
    return data;
};

/**
 * إضافة رسالة لمحادثة موجودة
 */
const addConversationMessage = async (clientId, customerPhone, role, content) => {
    const existing = await getConversation(clientId, customerPhone);
    const messages = existing?.messages || [];
    messages.push({ role, content, timestamp: new Date().toISOString() });

    // احتفظ بآخر 100 رسالة
    if (messages.length > 100) {
        messages.splice(0, messages.length - 100);
    }

    return saveConversation(clientId, customerPhone, existing?.platform || 'whatsapp', messages);
};

module.exports = { saveConversation, getConversation, addConversationMessage };
