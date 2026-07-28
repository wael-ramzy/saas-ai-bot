const supabase = require('./supabase');

const cleanPhone = (raw) => {
    return raw
        .replace('@c.us', '')
        .replace('@lid', '')
        .replace('@s.whatsapp.net', '')
        .replace(/[^0-9]/g, '')
        .trim();
};

// ── جلب بيانات زبون ──
const getCustomer = async (clientId, customerPhone) => {
    const phone = cleanPhone(customerPhone);

    const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('client_id', clientId)
        .eq('customer_phone', phone)
        .single();

    if (error) return null;
    return data;
};

// ── حفظ أو تحديث بيانات زبون ──
const saveCustomer = async (clientId, customerPhone, name, address, lastOrder) => {
    const phone = cleanPhone(customerPhone);

    const { data, error } = await supabase
        .from('customers')
        .upsert({
            client_id: clientId,
            customer_phone: phone,
            customer_name: name,
            address: address,
            last_order: lastOrder,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'client_id,customer_phone',
            ignoreDuplicates: false
        })
        .select()
        .single();

    if (error) {
        console.error('خطأ في حفظ الزبون:', error.message);
        return null;
    }
    return data;
};

module.exports = { getCustomer, saveCustomer };