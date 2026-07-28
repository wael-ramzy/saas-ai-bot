/**
 * فحص نية الزبون (هل يريد طلب جديد أم إضافة على طلب سابق)
 */
const detectIntent = async (messageText, lastOrder, timeDiff) => {
    // إذا لم يكن هناك طلب سابق أو مرت أكثر من 30 دقيقة -> طلب جديد
    if (!lastOrder || timeDiff > 30) {
        return 'NEW';
    }

    const text = (messageText || '').toLowerCase().trim();

    // كلمات صريحة تدل على بدء طلب جديد وتجاهل القديم
    const newOrderKeywords = [
        'طلب جديد', 'طلبية جديدة', 'الغي القديم', 'إلغاء الطلب السابق', 'القديم كنسله'
    ];

    const isExplicitNewOrder = newOrderKeywords.some(kw => text.includes(kw));
    if (isExplicitNewOrder) {
        return 'NEW';
    }

    // كلمات تدل على الإضافة
    const addonKeywords = [
        'أضف', 'اضف', 'زود', 'كمان', 'معاه', 'معاهم', 'إضافة', 'اضافة', 'تعديل', 'زيد'
    ];

    const hasAddonIntent = addonKeywords.some(kw => text.includes(kw));
    if (hasAddonIntent) {
        return 'ADDON';
    }

    // افتراضياً: طالما الطلب الأخير في غضون 30 دقيقة يُعتبر إضافة
    return 'ADDON';
};

module.exports = { detectIntent };