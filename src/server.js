/**
 * ═══════════════════════════════════════════════════════════════
 * SERVER — خادم Express الرئيسي للمنصة
 * ═══════════════════════════════════════════════════════════════
 * 
 * هذا هو نقطة الدخول الرئيسية للتطبيق.
 * يستبدل whatsapp-web.js بـ Meta Cloud APIs الرسمية.
 * 
 * المسارات:
 * ┌────────────────────────────────────────────────────────┐
 * │ GET  /health              — فحص صحة الخادم             │
 * │ GET  /webhook/whatsapp    — تحقق Meta (واتساب)         │
 * │ POST /webhook/whatsapp    — استقبال رسائل واتساب      │
 * │ GET  /webhook/messenger   — تحقق Meta (ماسنجر)        │
 * │ POST /webhook/messenger   — استقبال رسائل ماسنجر      │
 * │ GET  /webhook/instagram   — تحقق Meta (إنستجرام)      │
 * │ POST /webhook/instagram   — استقبال رسائل إنستجرام    │
 * │ POST /api/onboard         — إضافة تاجر جديد + قناة    │
 * │ POST /api/menu/index      — فهرسة المنيو في RAG        │
 * │ GET  /api/stats           — إحصائيات المنصة            │
 * └────────────────────────────────────────────────────────┘
 */

require('dotenv').config({
    path: require('path').join(__dirname, '..', 'config', '.env')
});

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

// ── Webhook Handlers ──
const whatsappWebhook = require('./meta/whatsappWebhook');
const messengerWebhook = require('./meta/messengerWebhook');
const instagramWebhook = require('./meta/instagramWebhook');

// ── DB & Services ──
const supabase = require('./db/supabase');
const { createClient, updateClient } = require('./db/clients');
const { indexMenuItems } = require('./rag/retriever');
const { getActiveSessionsCount } = require('./services/session');
const { startScheduler } = require('./services/scheduler');
const logger = require('./middleware/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
// bodyParser.json بحد 10MB (رسائل Meta قد تحتوي media)
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// ── CORS ──
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        sessions: getActiveSessionsCount()
    });
});

// ═══════════════════════════════════════════════════════════════
// WHATSAPP WEBHOOK
// ═══════════════════════════════════════════════════════════════
app.get('/webhook/whatsapp', (req, res) => {
    whatsappWebhook.handleVerification(req, res);
});

app.post('/webhook/whatsapp', (req, res) => {
    whatsappWebhook.handleIncomingMessage(req, res);
});

// ═══════════════════════════════════════════════════════════════
// MESSENGER WEBHOOK
// ═══════════════════════════════════════════════════════════════
app.get('/webhook/messenger', (req, res) => {
    messengerWebhook.handleVerification(req, res);
});

app.post('/webhook/messenger', (req, res) => {
    messengerWebhook.handleIncomingMessage(req, res);
});

// ═══════════════════════════════════════════════════════════════
// INSTAGRAM WEBHOOK
// ═══════════════════════════════════════════════════════════════
app.get('/webhook/instagram', (req, res) => {
    instagramWebhook.handleVerification(req, res);
});

app.post('/webhook/instagram', (req, res) => {
    instagramWebhook.handleIncomingMessage(req, res);
});

// ═══════════════════════════════════════════════════════════════
// ONBOARDING API — إضافة تاجر جديد للمنصة
// ═══════════════════════════════════════════════════════════════
app.post('/api/onboard', async (req, res) => {
    try {
        const {
            client_name,
            whatsapp_number,
            business_type,
            menu_items,        // [{name, description, category, price}]
            faqs,              // [{question, answer}]
            system_prompt,     // تعليمات مخصصة (اختياري)
            pdf_menu_url,      // رابط PDF (اختياري)
            // ── بيانات القناة (واتساب) ──
            meta_phone_id,
            meta_access_token,
            telegram_chat_id   // لإشعارات الطلبات
        } = req.body;

        if (!client_name || !business_type) {
            return res.status(400).json({ error: 'client_name و business_type مطلوبان' });
        }

        // 1. إنشاء التاجر
        const client = await createClient({
            client_name,
            whatsapp_number,
            business_type,
            system_prompt: system_prompt || null,
            pdf_menu_url: pdf_menu_url || null,
            is_active: true
        });

        if (!client) {
            return res.status(500).json({ error: 'فشل في إنشاء التاجر' });
        }

        // 2. إنشاء قناة الواتساب
        if (meta_phone_id && meta_access_token) {
            const { error: channelError } = await supabase
                .from('channels')
                .insert([{
                    client_id: client.client_id,
                    channel_type: 'whatsapp',
                    meta_phone_id,
                    meta_access_token,
                    meta_verify_token: process.env.META_WEBHOOK_VERIFY_TOKEN,
                    is_active: true
                }]);

            if (channelError) {
                logger.error('[Onboard] فشل في إنشاء القناة:', { error: channelError.message });
            }
        }

        // 3. تحديث telegram_chat_id
        if (telegram_chat_id) {
            await updateClient(client.client_id, { telegram_chat_id });
        }

        // 4. فهرسة المنيو في RAG
        let indexingResult = null;
        if (menu_items && menu_items.length > 0) {
            indexingResult = await indexMenuItems(client.client_id, menu_items);
        }

        // 5. إضافة FAQs
        if (faqs && faqs.length > 0) {
            for (const faq of faqs) {
                await supabase.from('faqs').insert([{
                    client_id: client.client_id,
                    question: faq.question,
                    answer: faq.answer,
                    keywords: faq.keywords || []
                }]);
            }
        }

        res.json({
            success: true,
            client_id: client.client_id,
            client_name: client.client_name,
            business_type: client.business_type,
            menu_indexed: indexingResult ? `${indexingResult.success}/${menu_items.length}` : 'N/A',
            webhooks: {
                whatsapp: `/webhook/whatsapp`,
                messenger: `/webhook/messenger`,
                instagram: `/webhook/instagram`
            }
        });

    } catch (err) {
        logger.error('[Onboard] خطأ:', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// MENU INDEXING API — إعادة فهرسة المنيو
// ═══════════════════════════════════════════════════════════════
app.post('/api/menu/index', async (req, res) => {
    try {
        const { client_id, menu_items } = req.body;

        if (!client_id || !menu_items || !menu_items.length) {
            return res.status(400).json({ error: 'client_id و menu_items مطلوبان' });
        }

        const result = await indexMenuItems(client_id, menu_items);
        res.json({ success: true, ...result });
    } catch (err) {
        logger.error('[Menu Index] خطأ:', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// STATS API — إحصائيات المنصة
// ═══════════════════════════════════════════════════════════════
app.get('/api/stats', async (req, res) => {
    try {
        const { data: clients } = await supabase
            .from('clients')
            .select('client_id', { count: 'exact', head: true })
            .eq('is_active', true);

        const { data: orders } = await supabase
            .from('orders')
            .select('order_id', { count: 'exact', head: true });

        res.json({
            active_clients: clients || 0,
            total_orders: orders || 0,
            active_sessions: getActiveSessionsCount(),
            uptime: process.uptime()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// DASHBOARD API ROUTES
// ═══════════════════════════════════════════════════════════════
const dashboardApi = require('./dashboard/api');

// ── Stats ──
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const stats = await dashboardApi.getPlatformStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Clients List ──
app.get('/api/dashboard/clients', async (req, res) => {
    try {
        const clients = await dashboardApi.getClients();
        res.json(clients);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Client Stats ──
app.get('/api/dashboard/clients/:clientId/stats', async (req, res) => {
    try {
        const stats = await dashboardApi.getClientStats(req.params.clientId);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Client Conversations ──
app.get('/api/dashboard/clients/:clientId/conversations', async (req, res) => {
    try {
        const convs = await dashboardApi.getConversations(req.params.clientId);
        res.json(convs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Conversation Messages ──
app.get('/api/dashboard/conversations/:convId/messages', async (req, res) => {
    try {
        const data = await dashboardApi.getConversationMessages(req.params.convId);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Send Reply from Dashboard ──
app.post('/api/dashboard/conversations/:convId/reply', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'message required' });
        const result = await dashboardApi.sendDashboardReply(req.params.convId, message);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Client Orders ──
app.get('/api/dashboard/clients/:clientId/orders', async (req, res) => {
    try {
        const orders = await dashboardApi.getOrders(req.params.clientId);
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Update Order Status ──
app.put('/api/dashboard/orders/:orderId', async (req, res) => {
    try {
        const data = await dashboardApi.updateOrder(req.params.orderId, req.body);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Client Customers ──
app.get('/api/dashboard/clients/:clientId/customers', async (req, res) => {
    try {
        const customers = await dashboardApi.getCustomers(req.params.clientId);
        res.json(customers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Inbound Log ──
app.get('/api/dashboard/logs', async (req, res) => {
    try {
        const logs = await dashboardApi.getInboundLog();
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// DASHBOARD STATIC FILES
// ═══════════════════════════════════════════════════════════════
app.use('/dashboard', express.static(path.join(__dirname, '..', 'public', 'dashboard')));
app.get('/onboard', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'public', 'dashboard', 'onboard.html'), (err) => {
        if (err) {
            logger.error('Error sending onboard.html:', err);
            res.status(500).json({ error: 'Failed to load onboard page' });
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════
const startServer = () => {
    app.listen(PORT, '0.0.0.0', () => {
        logger.info(`[Server] المنصة تعمل على المنفذ ${PORT}`);
        logger.info(`[Server] WhatsApp Webhook:  http://localhost:${PORT}/webhook/whatsapp`);
        logger.info(`[Server] Messenger Webhook: http://localhost:${PORT}/webhook/messenger`);
        logger.info(`[Server] Instagram Webhook: http://localhost:${PORT}/webhook/instagram`);
        logger.info(`[Server] Onboarding API:    http://localhost:${PORT}/api/onboard`);

        // بدء Scheduler للتقارير اليومية
        startScheduler();
    });
};

// ── معالجة الأخطاء غير المتوقعة ──
process.on('unhandledRejection', (err) => {
    logger.error('خطأ غير متوقع (Promise):', { error: err.message });
});

process.on('uncaughtException', (err) => {
    logger.error('خطأ حرج (Exception):', { error: err.message });
});

startServer();

module.exports = app;
