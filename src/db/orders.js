/**
 * ═══════════════════════════════════════════════════════════════
 * ORDERS — طبقة إدارة الطلبات
 * ═══════════════════════════════════════════════════════════════
 */

const supabase = require('./supabase');

// ── توليد رقم تعريفي للطلب ──
const generateOrderNumber = () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 9000) + 1000;
    return `ORD-${dateStr}-${random}`;
};

// ── حفظ طلب جديد ──
const saveOrder = async (clientId, orderData, channel = null) => {
    const orderNumber = generateOrderNumber();

    const { data, error } = await supabase
        .from('orders')
        .insert([{
            client_id: clientId,
            order_number: orderNumber,
            customer_phone: orderData.phone,
            customer_name: orderData.name,
            order_details: orderData.order,
            address: orderData.address,
            phone: orderData.phone,
            total: orderData.total,
            status: 'new',
            platform: orderData.platform || 'whatsapp',
            is_addon: false,
            channel_id: channel?.channel_id || null
        }])
        .select()
        .single();

    if (error) {
        console.error('خطأ في حفظ الطلب:', error.message);
        return null;
    }

    console.log(`[✓] طلب محفوظ: ${orderNumber}`);
    return data;
};

// ── إضافة ملحق لطلب موجود ──
const addOrderAddon = async (clientId, parentOrderId, addonData) => {
    const orderNumber = generateOrderNumber() + '-ADD';

    const { data, error } = await supabase
        .from('orders')
        .insert([{
            client_id: clientId,
            order_number: orderNumber,
            customer_phone: addonData.phone,
            customer_name: addonData.name,
            order_details: addonData.order,
            address: addonData.address,
            total: addonData.total,
            status: 'addon',
            is_addon: true,
            parent_order_id: parentOrderId
        }])
        .select()
        .single();

    if (error) {
        console.error('خطأ في حفظ الملحق:', error.message);
        return null;
    }

    console.log(`[✓] ملحق محفوظ: ${orderNumber}`);
    return data;
};

// ── جلب آخر طلب للزبون ──
const getLastOrder = async (clientId, customerPhone) => {
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('client_id', clientId)
        .eq('customer_phone', customerPhone)
        .eq('is_addon', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error) return null;
    return data;
};

// ── جلب طلبات تاجر معين ──
const getClientOrders = async (clientId, limit = 50) => {
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) return [];
    return data;
};

// ── تقرير يومي ──
const getDailyReport = async (clientId) => {
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('client_id', clientId)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`);

    if (error || !data) return null;

    // حساب الإجمالي
    const totalRevenue = data.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
    const totalOrders = data.length;

    // أكثر صنف طُلب
    const itemCount = {};
    data.forEach(o => {
        const item = o.order_details || '';
        itemCount[item] = (itemCount[item] || 0) + 1;
    });
    const topItem = Object.entries(itemCount)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'لا يوجد';

    return {
        date: today,
        totalOrders,
        totalRevenue,
        topItem,
        orders: data
    };
};

// ── تحديث حالة الطلب ──
const updateOrderStatus = async (orderId, status) => {
    const { data, error } = await supabase
        .from('orders')
        .update({ status })
        .eq('order_id', orderId)
        .select()
        .single();

    if (error) {
        console.error('خطأ في تحديث الطلب:', error.message);
        return null;
    }
    return data;
};

module.exports = { 
    saveOrder, 
    addOrderAddon,
    getLastOrder,
    getClientOrders, 
    getDailyReport,
    updateOrderStatus 
};