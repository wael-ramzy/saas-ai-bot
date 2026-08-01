// seed.js — إضافة بيانات تجريبية
require('dotenv').config({ 
    path: require('path').join(__dirname, '..', 'config', '.env') 
});

const supabase = require('../src/db/supabase');

const seedData = async () => {
    console.log('جاري إضافة البيانات التجريبية...');

    // إضافة تاجر تجريبي
    const { data: client, error } = await supabase
        .from('clients')
        .upsert([{
            client_name: 'حسين سوشي',
            whatsapp_number: '201159030986@c.us',
            telegram_chat_id: process.env.TELEGRAM_CHAT_ID,
            business_type: 'restaurant',
            menu_text: `
12 قطعة: 180 جنيه
16 قطعة: 240 جنيه
24 قطعة: 360 جنيه
30 قطعة: 450 جنيه
40 قطعة: 600 جنيه
50 قطعة: 750 جنيه
بوكس 50 قطعة مميز: 599 جنيه
نودلز خضار (2): 200 جنيه
نودلز فراخ (2): 220 جنيه
نودلز جمبري (2): 260 جنيه
نودلز سيفود (2): 310 جنيه
            `,
            is_active: true
        }], { onConflict: 'whatsapp_number' })
        .select()
        .single();

    if (error) {
        console.error('خطأ:', error.message);
    } else {
        console.log('[✓] تم إضافة التاجر:', client.client_name);
    }

    console.log('تم!');
    process.exit(0);
};

seedData();