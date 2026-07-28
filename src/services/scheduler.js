const { getDailyReport } = require('../db/orders');
const { getActiveSessionsCount, clearSession } = require('./session');
const supabase = require('../db/supabase');
const axios = require('axios');
require('dotenv').config({
    path: require('path').join(__dirname, '..', '..', 'config', '.env')
});

// ── إرسال التقرير اليومي لكل تاجر ──
const sendDailyReports = async () => {
    console.log('[Scheduler] جاري إرسال التقارير اليومية...');

    // جلب كل التجار النشطين
    const { data: clients } = await supabase
        .from('clients')
        .select('*')
        .eq('is_active', true);

    if (!clients || clients.length === 0) return;

    for (const client of clients) {
        try {
            const report = await getDailyReport(client.client_id);
            if (!report) continue;

            const text = `
📊 *التقرير اليومي — ${report.date}*
=========================
🏪 *${client.client_name}*
=========================
📦 *عدد الطلبات:* ${report.totalOrders}
💰 *إجمالي المبيعات:* ${report.totalRevenue} جنيه
🏆 *أكثر صنف طُلب:* ${report.topItem}
=========================
⏰ تم الإرسال تلقائياً بواسطة RapidReply
            `;

            if (client.telegram_chat_id && process.env.TELEGRAM_BOT_TOKEN) {
                await axios.post(
                    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
                    {
                        chat_id: client.telegram_chat_id,
                        text,
                        parse_mode: 'Markdown'
                    }
                );
                console.log(`[✓] تقرير أُرسل لـ ${client.client_name}`);
            }

            // حفظ التقرير في Supabase
            await supabase.from('daily_reports').insert([{
                client_id: client.client_id,
                report_date: report.date,
                total_orders: report.totalOrders,
                total_revenue: report.totalRevenue,
                top_item: report.topItem,
                report_data: report.orders
            }]);

        } catch (err) {
            console.error(`خطأ في تقرير ${client.client_name}:`, err.message);
        }
    }
};

// ── حساب الوقت لحد الساعة 11 مساءً ──
const getMillisUntil11PM = () => {
    const now = new Date();
    const target = new Date();
    target.setHours(23, 0, 0, 0);

    // لو عدت الساعة 11 خليها بكره
    if (now > target) {
        target.setDate(target.getDate() + 1);
    }

    return target - now;
};

// ── بدء الـ Scheduler ──
const startScheduler = () => {
    // تقرير يومي الساعة 11 مساءً
    const scheduleDaily = () => {
        const delay = getMillisUntil11PM();
        console.log(`[Scheduler] التقرير اليومي هيتبعت بعد ${Math.round(delay / 3600000)} ساعة`);

        setTimeout(async () => {
            await sendDailyReports();
            // جدول تاني للغد
            scheduleDaily();
        }, delay);
    };

    scheduleDaily();

    // تنظيف الجلسات القديمة كل ساعة
    setInterval(() => {
        const count = getActiveSessionsCount();
        console.log(`[Scheduler] جلسات نشطة: ${count}`);
    }, 60 * 60 * 1000);

    console.log('[✓] Scheduler شغال');
};

module.exports = { startScheduler, sendDailyReports };