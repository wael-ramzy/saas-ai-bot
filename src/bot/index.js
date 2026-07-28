require('dotenv').config({ 
    path: require('path').join(__dirname, '..', '..', 'config', '.env') 
});

const { createWhatsAppClient } = require('./whatsapp');
const { handleMessage } = require('./router');
const { startScheduler } = require('../services/scheduler');
const logger = require('../middleware/logger');

const client = createWhatsAppClient();

client.on('qr', (qr) => {
    const qrcode = require('qrcode-terminal');
    qrcode.generate(qr, { small: true });
    logger.info('امسح الـ QR لربط الواتساب');
});

client.on('ready', () => {
    logger.info('البوت شغال وجاهز!');
    startScheduler();
});

client.on('disconnected', (reason) => {
    logger.warn('انقطع الاتصال', { reason });
    setTimeout(() => {
        client.initialize();
    }, 5000);
});

client.on('auth_failure', (msg) => {
    logger.error('فشل المصادقة', { msg });
});

client.on('message', async (msg) => {
    // تجاهل الجروبات والبرودكاست
    if (msg.fromMe) return;
    if (msg.from.includes('@g.us')) return;
    if (msg.from === 'status@broadcast') return;

    // تجاهل الرسائل القديمة أكتر من 5 دقائق
    const now = Math.floor(Date.now() / 1000);
    if (msg.timestamp && now - msg.timestamp > 300) return;

    // تأخير عشوائي قبل الرد (يمنع الحظر)
    const delay = Math.floor(Math.random() * 2000) + 1000;
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
        await handleMessage(msg, client);
    } catch (err) {
        logger.error('خطأ في معالجة الرسالة', { error: err.message });
    }
});

// منع crash عند أي خطأ غير متوقع
process.on('unhandledRejection', (err) => {
    logger.error('خطأ غير متوقع', { error: err.message });
});

process.on('uncaughtException', (err) => {
    logger.error('خطأ حرج', { error: err.message });
});

client.initialize();