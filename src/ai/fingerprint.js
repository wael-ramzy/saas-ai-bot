/**
 * استخراج رقم الزبون مع معالجة حسابات @lid الخاصة بتحديثات الواتساب الجديدة
 */
const getCustomerIdentifier = (msg) => {
    if (!msg) return '';

    let rawId = msg.from;

    // إذا كان المعرّف يظهر كـ @lid، نبحث عن الرقم الحقيقي في أجزاء الرسالة الأخرى
    if (rawId && rawId.includes('@lid')) {
        if (msg.author && !msg.author.includes('@lid')) {
            rawId = msg.author;
        } else if (msg._data && msg._data.from && !msg._data.from.includes('@lid')) {
            rawId = msg._data.from;
        }
    }

    if (!rawId) return '';

    // تنظيف المعرف واستخراج الأرقام فقط
    return rawId
        .replace('@c.us', '')
        .replace('@lid', '')
        .replace('@s.whatsapp.net', '')
        .replace(/[^0-9]/g, '')
        .trim();
};

module.exports = { getCustomerIdentifier };