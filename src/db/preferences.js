const supabase = require('./supabase');

// ── جلب تفضيلات زبون ──
const getPreferences = async (clientId, customerPhone) => {
    const { data, error } = await supabase
        .from('customer_preferences')
        .select('*')
        .eq('client_id', clientId)
        .eq('customer_phone', customerPhone)
        .single();

    if (error) return null;
    return data;
};

// ── تحديث تفضيلات زبون ──
const updatePreferences = async (clientId, customerPhone, orderDetails, total) => {
    const existing = await getPreferences(clientId, customerPhone);

    // تحديث قائمة الأصناف المفضلة
    let favoriteItems = existing?.favorite_items || [];
    
    // إضافة الصنف الجديد
    const existingItem = favoriteItems.find(i => i.item === orderDetails);
    if (existingItem) {
        existingItem.count += 1;
    } else {
        favoriteItems.push({ item: orderDetails, count: 1 });
    }

    // ترتيب حسب الأكثر طلباً
    favoriteItems = favoriteItems
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // احتفظ بأكثر 5 أصناف بس

    const orderCount = (existing?.order_count || 0) + 1;
    const totalSpent = (existing?.total_spent || 0) + (parseFloat(total) || 0);
    const avgOrderValue = totalSpent / orderCount;

    const { data, error } = await supabase
        .from('customer_preferences')
        .upsert({
            client_id: clientId,
            customer_phone: customerPhone,
            favorite_items: favoriteItems,
            order_count: orderCount,
            total_spent: totalSpent,
            avg_order_value: avgOrderValue,
            last_order_date: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'client_id,customer_phone'
        })
        .select()
        .single();

    if (error) {
        console.error('خطأ في تحديث التفضيلات:', error.message);
        return null;
    }

    return data;
};

// ── بناء ملخص التفضيلات للـ AI ──
const buildPreferencesContext = (preferences) => {
    if (!preferences) return '';

    const topItems = preferences.favorite_items
        ?.slice(0, 3)
        .map(i => i.item)
        .join('، ') || 'لا يوجد';

    return `
[تفضيلات الزبون]
عدد طلباته: ${preferences.order_count}
أكثر ما يطلب: ${topItems}
متوسط إنفاقه: ${Math.round(preferences.avg_order_value)} جنيه
    `;
};

module.exports = { getPreferences, updatePreferences, buildPreferencesContext };