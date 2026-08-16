/**
 * ═══════════════════════════════════════════════════════════════
 * DASHBOARD API — Endpoints للوحة التحكم
 * ═══════════════════════════════════════════════════════════════
 * 
 * يعرض هذا الملف كل الـ API endpoints المطلوبة للوحة التحكم:
 * - إحصائيات عامة / لكل تاجر
 * - قائمة التجار
 * - المحادثات لكل تاجر (مع الرسائل)
 * - الطلبات لكل تاجر
 */

const supabase = require('../db/supabase');
const { getActiveSessionsCount } = require('../services/session');

// ─────────────────────────────────────────────
// إحصائيات المنصة كاملة
// ─────────────────────────────────────────────
const getPlatformStats = async () => {
    const [clientsRes, ordersRes, convsRes, todayOrdersRes] = await Promise.all([
        supabase.from('clients').select('client_id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('orders').select('order_id', { count: 'exact', head: true }),
        supabase.from('conversations').select('conv_id', { count: 'exact', head: true }),
        supabase.from('orders').select('order_id', { count: 'exact', head: true }).gte('created_at', new Date().toISOString().split('T')[0])
    ]);

    return {
        active_clients: clientsRes.count || 0,
        total_orders: ordersRes.count || 0,
        total_conversations: convsRes.count || 0,
        today_orders: todayOrdersRes.count || 0,
        active_sessions: getActiveSessionsCount(),
        uptime: process.uptime()
    };
};

// ─────────────────────────────────────────────
// قائمة كل التجار مع إحصائياتهم
// ─────────────────────────────────────────────
const getClients = async () => {
    const { data: clients, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    if (!clients) return [];

    // جلب إحصائيات كل تاجر
    const clientsWithStats = await Promise.all(
        clients.map(async (client) => {
            const [ordersRes, convsRes, channelRes] = await Promise.all([
                supabase.from('orders').select('order_id', { count: 'exact', head: true }).eq('client_id', client.client_id),
                supabase.from('conversations').select('conv_id', { count: 'exact', head: true }).eq('client_id', client.client_id),
                supabase.from('channels').select('channel_type, is_active').eq('client_id', client.client_id)
            ]);

            return {
                ...client,
                orders_count: ordersRes.count || 0,
                conversations_count: convsRes.count || 0,
                channels: channelRes.data || [],
                created_at: client.created_at
            };
        })
    );

    return clientsWithStats;
};

// ─────────────────────────────────────────────
// إحصائيات تاجر معين
// ─────────────────────────────────────────────
const getClientStats = async (clientId) => {
    const [clientRes, ordersRes, convsRes, customersRes, prefsRes, todayOrdersRes] = await Promise.all([
        supabase.from('clients').select('*').eq('client_id', clientId).single(),
        supabase.from('orders').select('order_id, total, status, created_at', { count: 'exact' }).eq('client_id', clientId),
        supabase.from('conversations').select('conv_id', { count: 'exact', head: true }).eq('client_id', clientId),
        supabase.from('customers').select('customer_id', { count: 'exact', head: true }).eq('client_id', clientId),
        supabase.from('customer_preferences').select('pref_id', { count: 'exact', head: true }).eq('client_id', clientId),
        supabase.from('orders').select('order_id', { count: 'exact', head: true })
            .eq('client_id', clientId)
            .gte('created_at', new Date().toISOString().split('T')[0])
    ]);

    if (clientRes.error) throw new Error(clientRes.error.message);

    const orders = ordersRes.data || [];
    const totalRevenue = orders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
    const pendingOrders = orders.filter(o => ['new', 'confirmed', 'preparing'].includes(o.status)).length;
    const deliveredOrders = orders.filter(o => o.status === 'delivered').length;

    return {
        client: clientRes.data,
        orders_count: ordersRes.count || 0,
        total_revenue: totalRevenue,
        pending_orders: pendingOrders,
        delivered_orders: deliveredOrders,
        today_orders: todayOrdersRes.count || 0,
        conversations_count: convsRes.count || 0,
        customers_count: customersRes.count || 0,
        preferences_count: prefsRes.count || 0
    };
};

// ─────────────────────────────────────────────
// المحادثات (مجموعة) لكل تاجر
// ─────────────────────────────────────────────
const getConversations = async (clientId, limit = 50) => {
    const { data: conversations, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('client_id', clientId)
        .order('updated_at', { ascending: false })
        .limit(limit);

    if (error) throw new Error(error.message);
    return conversations || [];
};

// ─────────────────────────────────────────────
// رسائل محادثة معينة (مخزنة كـ JSON في messages column)
// ─────────────────────────────────────────────
const getConversationMessages = async (conversationId) => {
    const { data: conversation, error } = await supabase
        .from('conversations')
        .select('messages, customer_phone, platform')
        .eq('conv_id', conversationId)
        .single();

    if (error) throw new Error(error.message);
    if (!conversation) return { messages: [], customer_phone: '', platform: '' };

    return {
        messages: conversation.messages || [],
        customer_phone: conversation.customer_phone,
        platform: conversation.platform
    };
};

// ─────────────────────────────────────────────
// إرسال رد يدوي في محادثة (من الداشبورد)
// ─────────────────────────────────────────────
const sendDashboardReply = async (conversationId, messageText) => {
    // جلب المحادثة لمعرفة التاجر والقناة
    const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('client_id, customer_phone, platform, messages')
        .eq('conv_id', conversationId)
        .single();

    if (convError) throw new Error(convError.message);
    if (!conv) throw new Error('Conversation not found');

    const { client_id, customer_phone, platform, messages } = conv;

    // جلب القناة النشطة للتاجر
    const { data: channel, error: channelError } = await supabase
        .from('channels')
        .select('*')
        .eq('client_id', client_id)
        .eq('is_active', true)
        .single();

    if (channelError) throw new Error('No active channel found');

    // 1. إرسال الرد عبر Meta API
    const metaApi = require('../meta/metaApi');
    await metaApi.sendChannelMessage(channel, customer_phone, messageText);

    // 2. تحديث المحادثة — إضافة رسالة الرد
    const existingMessages = typeof messages === 'string' ? JSON.parse(messages) : (messages || []);
    const updatedMessages = [...existingMessages, {
        role: 'assistant',
        content: messageText,
        timestamp: new Date().toISOString()
    }];

    const { error: updateError } = await supabase
        .from('conversations')
        .update({ messages: JSON.stringify(updatedMessages), updated_at: new Date().toISOString() })
        .eq('conv_id', conversationId);

    if (updateError) throw new Error(updateError.message);

    return { success: true, platform };
};

// ─────────────────────────────────────────────
// الطلبات لكل تاجر
// ─────────────────────────────────────────────
const getOrders = async (clientId, limit = 100) => {
    const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw new Error(error.message);
    return orders || [];
};

// ─────────────────────────────────────────────
// تحديث حالة الطلب
// ─────────────────────────────────────────────
const updateOrder = async (orderId, updates) => {
    const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('order_id', orderId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

// ─────────────────────────────────────────────
// قائمة الزبائن لتاجر معين
// ─────────────────────────────────────────────
const getCustomers = async (clientId, limit = 100) => {
    const { data: customers, error } = await supabase
        .from('customers')
        .select('*')
        .eq('client_id', clientId)
        .order('last_message_at', { ascending: false })
        .limit(limit);

    if (error) throw new Error(error.message);
    return customers || [];
};

// ─────────────────────────────────────────────
// التفضيلات لعميل معين عند تاجر معين
// ─────────────────────────────────────────────
const getCustomerPreferences = async (clientId, customerPhone) => {
    const { data, error } = await supabase
        .from('customer_preferences')
        .select('*')
        .eq('client_id', clientId)
        .eq('customer_phone', customerPhone);

    if (error) throw new Error(error.message);
    return data || [];
};

// ─────────────────────────────────────────────
// سجل الأحداث (inbound log) — لمراقبة الاستعلامات
// ─────────────────────────────────────────────
const getInboundLog = async (limit = 100) => {
    const { data, error } = await supabase
        .from('inbound_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw new Error(error.message);
    return data || [];
};

module.exports = {
    getPlatformStats,
    getClients,
    getClientStats,
    getConversations,
    getConversationMessages,
    sendDashboardReply,
    getOrders,
    updateOrder,
    getCustomers,
    getCustomerPreferences,
    getInboundLog
};
