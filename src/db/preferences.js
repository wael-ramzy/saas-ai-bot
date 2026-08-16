/**
 * ═══════════════════════════════════════════════════════════════
 * PREFERENCES — طبقة تفضيلات الزبائن
 * ═══════════════════════════════════════════════════════════════
 * 
 * تحسب وتُحدّث:
 * - الأصناف الأكثر طلباً (أول 5)
 * - عدد الطلبات
 * - إجمالي الإنفاق
 * - متوسط قيمة الطلب
 * - الأقسام المفضلة
 */

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

    // ── تحديث قائمة الأصناف المفضلة ──
    let favoriteItems = existing?.favorite_items || [];

    // تفكيك تفاصيل الطلب إلى أصناف
    const items = (orderDetails || '')
        .split(/[،,;\n]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    for (const item of items) {
        const existingItem = favoriteItems.find(i => i.item.toLowerCase() === item.toLowerCase());
        if (existingItem) {
            existingItem.count += 1;
        } else {
            favoriteItems.push({ item, count: 1 });
        }
    }

    // ترتيب حسب الأكثر طلباً + الاحتفاظ بأفضل 5
    favoriteItems = favoriteItems
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // ── تحديث الإحصائيات ──
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
            total_spent: Math.round(totalSpent * 100) / 100,
            avg_order_value: Math.round(avgOrderValue * 100) / 100,
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

// ── بناء ملخص التفضيلات للبرومبت ──
const buildPreferencesContext = (preferences) => {
    if (!preferences) return '';

    const topItems = (preferences.favorite_items || [])
        .slice(0, 3)
        .map(i => `${i.item} (×${i.count})`)
        .join('، ') || 'لا يوجد';

    return `عدد طلباته: ${preferences.order_count}
أكثر ما يطلب: ${topItems}
متوسط إنفاقه: ${Math.round(preferences.avg_order_value || 0)} جنيه
تاريخ آخر طلب: ${preferences.last_order_date ? preferences.last_order_date.slice(0, 10) : 'غير محدد'}`;
};

module.exports = { getPreferences, updatePreferences, buildPreferencesContext };
