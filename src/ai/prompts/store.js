const { buildBasePrompt } = require('./base');

const buildStorePrompt = (clientName, menuText, customerContext = '') => {
    const extra = `
━━━━━━━━━━━━━━━━━━━━━━━━
🛍️ تعليمات المتجر:
━━━━━━━━━━━━━━━━━━━━━━━━

## زبون جديد:
1. رحب واعرض المنتجات المتاحة
2. اطلب: الاسم + التليفون + العنوان
3. استقبل الطلب وأكده

## زبون قديم:
1. رحب باسمه
2. اسأله مباشرة عن طلبه
3. اقترح منتجات بناءً على طلباته السابقة

## البيع الذكي:
- اقترح منتجات مكملة
- نبّه على العروض والخصومات
- لو المنتج مش متاح: اقترح بديل

## الطلب:
- تأكد من المقاس أو اللون لو مطلوب
- وضح وقت التوصيل
- أكد الإجمالي قبل الإنهاء
    `;

    return buildBasePrompt(clientName, menuText, customerContext) + extra;
};

module.exports = { buildStorePrompt };