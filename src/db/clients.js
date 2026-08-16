/**
 * ═══════════════════════════════════════════════════════════════
 * CLIENTS — طبقة إدارة التجار (Tenants)
 * ═══════════════════════════════════════════════════════════════
 */

const supabase = require('./supabase');

/**
 * تنظيف رقم الهاتف وتوحيده
 * @param {string} raw - رقم خام (قد يحتوي @c.us أو @lid)
 * @returns {string} رقم نظيف
 */
const cleanPhone = (raw) => {
    if (!raw) return '';
    return raw
        .replace('@c.us', '')
        .replace('@lid', '')
        .replace('@s.whatsapp.net', '')
        .replace(/[^0-9]/g, '')
        .trim();
};

// ── جلب تاجر برقم الواتساب ──
const getClientByPhone = async (whatsappNumber) => {
    const cleanNumber = cleanPhone(whatsappNumber);

    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('whatsapp_number', cleanNumber)
        .eq('is_active', true)
        .single();

    if (error) return null;
    return data;
};

// ── جلب تاجر بـ client_id ──
const getClientById = async (clientId) => {
    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('client_id', clientId)
        .single();

    if (error) return null;
    return data;
};

// ── إضافة تاجر جديد ──
const createClient = async (clientData) => {
    const { data, error } = await supabase
        .from('clients')
        .insert([clientData])
        .select()
        .single();

    if (error) {
        console.error('خطأ في إضافة التاجر:', error.message);
        return null;
    }
    return data;
};

// ── تحديث بيانات تاجر ──
const updateClient = async (clientId, updates) => {
    const { data, error } = await supabase
        .from('clients')
        .update(updates)
        .eq('client_id', clientId)
        .select()
        .single();

    if (error) {
        console.error('خطأ في تحديث التاجر:', error.message);
        return null;
    }
    return data;
};

// ── جلب كل التجار النشطين ──
const getAllClients = async () => {
    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    if (error) return [];
    return data;
};

// ── جلب قناة تاجر ──
const getClientChannel = async (clientId, channelType = 'whatsapp') => {
    const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('client_id', clientId)
        .eq('channel_type', channelType)
        .eq('is_active', true)
        .single();

    if (error) return null;
    return data;
};

module.exports = {
    cleanPhone,
    getClientByPhone,
    getClientById,
    createClient,
    updateClient,
    getAllClients,
    getClientChannel
};
