const supabase = require('../db/supabase');

// ── التحقق من حظر رقم ──
const isBlacklisted = async (phone) => {
    const { data } = await supabase
        .from('blacklist')
        .select('phone')
        .eq('phone', phone)
        .single();
    
    return !!data;
};

// ── إضافة رقم للقائمة السوداء ──
const addToBlacklist = async (phone, reason = '') => {
    await supabase
        .from('blacklist')
        .insert([{ phone, reason }]);
};

module.exports = { isBlacklisted, addToBlacklist };