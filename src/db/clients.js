const supabase = require('./supabase');

// ── جلب تاجر برقم الواتساب ──
const getClientByPhone = async (whatsappNumber) => {
    // نظف الرقم من أي زوائد
    const cleanNumber = whatsappNumber
        .replace('@c.us', '')
        .replace('@lid', '')
        .replace('@s.whatsapp.net', '')
        .replace(/[^0-9]/g, '')
        .trim();

    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('whatsapp_number', cleanNumber)
        .eq('is_active', true)
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

module.exports = { getClientByPhone, createClient, updateClient, getAllClients };