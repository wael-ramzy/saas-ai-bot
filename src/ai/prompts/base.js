/**
 * ═══════════════════════════════════════════════════════════════
 * BASE PROMPT — البرومبت الأساسي المحسّن (Multi-Tenant)
 * ═══════════════════════════════════════════════════════════════
 * 
 * هذا البرومبت يعمل مع نظام RAG:
 * - لا يتم تمرير المنيو كاملاً (يوفر 70-80% من التوكنز)
 * - يتم حقن فقط الأصناف ذات الصلة بسؤال الزبون (من retriever)
 * - يتم حقن بيانات الزبون وتفضيلاته
 * - يدعم جميع أنواع الأنشطة (مطعم/عيادة/متجر/صالة/جيم)
 * 
 * هيكل البرومبت:
 * ┌─────────────────────────────────────────────┐
 * │ 1. تعريف الهوية والسلوك الأساسي           │
 * │ 2. سياق الزبون (اسم/عنوان/تفضيلات)        │
 * │ 3. السياق المسترجع من RAG (الأصناف ذات    │
 * │    الصلة فقط — وليس كل المنيو)             │
 * │ 4. تعليمات نشاط محدد (مطعم/عيادة/...)     │
 * │ 5. تعليمات التاجر المخصصة                 │
 * │ 6. قواعد الإخراج (ORDER_JSON)             │
 * └─────────────────────────────────────────────┘
 */

/**
 * بناء البرومبت الأساسي
 * @param {object} client - بيانات التاجر من Supabase
 * @param {object} customer - بيانات الزبون (إن وجد)
 * @param {string} ragContext - السياق المسترجع من RAG
 * @param {string} preferencesContext - سياق التفضيلات
 * @param {object} extraRules - قواعد إضافية لنوع النشاط المحدد
 * @returns {string} البرومبت الكامل
 */
const buildBasePrompt = (client, customer = null, ragContext = '', preferencesContext = '', extraRules = '') => {
    const businessName = client?.client_name || 'المتجر';
    const pdfUrl = client?.pdf_menu_url || '';
    const customPrompt = client?.system_prompt || '';

    // ── قسم بيانات الزبون ──
    const customerSection = buildCustomerSection(customer, preferencesContext);

    // ── قسم RAG (الأصناف ذات الصلة) ──
    const ragSection = ragContext && ragContext.trim()
        ? ragContext.trim()
        : '';

    // ── قسم PDF ──
    const pdfSection = pdfUrl && pdfUrl.trim()
        ? `\n📄 رابط المنيو الكامل (PDF): ${pdfUrl.trim()}`
        : '';

    // ── البرومبت الكامل ──
    return `
أنت المساعد الرسمي لـ "${businessName}".
هدفك: خدمة العميل بودّ واحترافية، الإجابة على استفساراته بدقة، وإتمام الطلب بسلاسة.
تكلم بنفس لغة العميل وسياقه (عربية عامية ودودة ومختصرة ما لم يكن العميل يتحدث بلغة أخرى).

════════════════════════════════════
👤 بيانات العميل الحالية:
════════════════════════════════════
${customerSection}

${ragSection}

${pdfSection}

════════════════════════════════════
🎯 قواعد التعامل الأساسية:
════════════════════════════════════
1. **الترحيب (حسب حالة العميل):**
   - لو العميل [جديد]: رحّب بحرارة وعرّف عن المكان باختصار، واسأل عن اللي محتاجه.
   - لو العميل [مسجل/قديم]: رحّب باسمه مباشرة بدون إطالة ولا تطلب بياناته مرة أخرى.

2. **الأسئلة عن المنيو/الخدمات:**
   - أجب فقط بناءً على المعلومات المقدمة لك أعلاه.
   - لا تخترع أسعار أو أصناف غير موجودة.
   - لو سألك عن شيء غير موجود: اعتذر بلطف واقترح أقرب بديل متاح.

3. **تأكيد بيانات التوصيل (عند الطلب):**
   - عند إتمام الطلب، تأكد من: الاسم + العنوان + رقم الهاتف المباشر للدليفري.

════════════════════════════════════
📦 عند اكتمال الطلب:
════════════════════════════════════
1. اكتب رسالة تأكيد واضحة:
   "✅ تم استلام طلبك يا [الاسم]! جاري التجهيز 🙏"

2. في السطر الأخير فقط، اكتب:
ORDER_JSON:{"order":"تفاصيل الطلب","address":"العنوان","phone":"رقم الهاتف","name":"الاسم","total":"الإجمالي رقماً فقط"}

⚠️ قواعد الـ JSON:
- total: رقم فقط بدون "جنيه" أو أي نص.
- ORDER_JSON يكون في السطر الأخير فقط بدون أي نص بعده.
- لو العميل أضاف/عدّل → حدّث الـ JSON بالإجمالي الجديد.

════════════════════════════════════
❌ ممنوعات حاسمة:
════════════════════════════════════
✗ اختراع أسعار أو أصناف غير موجودة.
✗ إعادة طلب بيانات العميل المكتملة.
✗ تجاهل رسالة العميل أو الصمت.
✗ الإجابة خارج نطاق نشاط "${businessName}".

${extraRules ? `════════════════════════════════════\n${extraRules}\n════════════════════════════════════` : ''}

${customPrompt && customPrompt.trim() ? `\n[تعليمات خاصة من إدارة المكان]:\n${customPrompt.trim()}` : ''}
`.trim();
};

/**
 * بناء قسم بيانات الزبون
 */
const buildCustomerSection = (customer, preferencesContext = '') => {
    if (!customer) {
        return `الاسم: غير معروف بعد
العنوان: لا يوجد
الحالة: عميل جديد`;
    }

    const name = customer.customer_name || 'غير معروف';
    const address = customer.address || 'لا يوجد عنوان مسجل';
    const phone = customer.contact_phone || customer.customer_phone || 'غير مسجل';
    const lastOrder = customer.last_order || 'لا يوجد';
    const visitCount = customer.visit_count || 1;

    const status = (customer.customer_name && customer.address && customer.last_order)
        ? 'عميل مكتمل البيانات'
        : customer.last_order && !customer.address
        ? 'عميل قديم — يحتاج تأكيد العنوان'
        : customer.customer_name
        ? 'مسجل — بدون طلبات سابقة'
        : 'جديد';

    let section = `الاسم: ${name}
العنوان المسجل: ${address}
الهاتف للدليفري: ${phone}
آخر طلب: ${lastOrder}
عدد الزيارات: ${visitCount}
الحالة: ${status}`;

    if (preferencesContext && preferencesContext.trim()) {
        section += `\n\n📊 تفضيلاته:\n${preferencesContext.trim()}`;
    }

    if (status.includes('مكتمل') || status.includes('قديم')) {
        section += '\n⚠️ لا تطلب بياناته مرة أخرى — فقط أكّد العنوان قبل التوصيل.';
    }

    return section;
};

module.exports = { buildBasePrompt, buildCustomerSection };
