/**
 * ═══════════════════════════════════════════════════════════════
 * CUSTOMERS — طبقة إدارة الزبائن
 * ═══════════════════════════════════════════════════════════════
 */

const supabase = require('./supabase');
const { cleanPhone } = require('./clients');

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

    // جلب الزيارة الحالية
    const existing = await getCustomer(clientId, phone);
    const visitCount = (existing?.visit_count || 0) + 1;

    const { data, error } = await supabase
        .from('customers')
        .upsert({
            client_id: clientId,
            customer_phone: phone,
            customer_name: name || existing?.customer_name,
            address: address || existing?.address,
            last_order: lastOrder,
            visit_count: visitCount,
            last_message_at: new Date().toISOString(),
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

// ── تحديث last_message_at فقط ──
const touchCustomer = async (clientId, customerPhone) => {
    const phone = cleanPhone(customerPhone);

    const { error } = await supabase
        .from('customers')
        .update({
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('client_id', clientId)
        .eq('customer_phone', phone);

    if (error) console.error('[Customers] خطأ touch:', error.message);
};

module.exports = { getCustomer, saveCustomer, touchCustomer };
