const cron = require('node-cron');
const supabase = require('../config/supabase'); // كائن قاعدة البيانات عندك
const { sendWhatsAppMessage } = require('./index'); // دالة إرسال الواتساب

// تشغيل الفحص كل 15 دقيقة
cron.schedule('*/15 * * * *', async () => {
    console.log('[Cron] جاري الفحص عن العملاء غير المتفاعلين...');

    // حساب الوقت من 20 دقيقة مضت
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    // جلب العملاء اللي سكتوا لأكثر من 20 دقيقة ومطلبوش
    const { data: idleCustomers, error } = await supabase
        .from('customers')
        .select('*')
        .eq('order_status', 'pending')
        .is('reminded_at', null)
        .lt('last_message_at', twentyMinutesAgo);

    if (error || !idleCustomers) return;

    for (const customer of idleCustomers) {
        const followUpMessage = `أهلاً بك مرة أخرى يا ${customer.customer_name || 'فندم'}! 😊\nحبّيت أطمن، هل حابب أساعدك تختار حاجة معينة من المنيو، أو عندك أي استفسار؟ 🌸`;

        // إرسال الرسالة عبر الواتساب
        await sendWhatsAppMessage(customer.phone_number, followUpMessage);

        // تحديث الداتابيز عشان ميبعتلوش تذكير تاني
        await supabase
            .from('customers')
            .update({ reminded_at: new Date().toISOString() })
            .eq('id', customer.id);
    }
});