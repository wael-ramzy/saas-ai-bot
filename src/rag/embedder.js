/**
 * ═══════════════════════════════════════════════════════════════
 * EMBEDDER — طبقة توليد المتجهات (Vector Embeddings)
 * ═══════════════════════════════════════════════════════════════
 * 
 * هذه الطبقة مسؤولة عن:
 * 1. تحويل نص رسالة الزبون إلى embedding
 * 2. تحويل نصوص المنيو/الخدمات إلى embeddings عند إضافتها
 * 
 * نستخدم OpenAI text-embedding-3-small (1536 أبعاد) لأنه:
 * - أرخص بكثير من نماذج الـ Chat
 * - دقة عالية جداً في العربية والإنجليزية
 * - متوافق مع pgvector في Supabase
 * 
 * يمكنك استبداله بـ any compatible API (Jina, Voyage, BGE-M3)
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');
const logger = require('../middleware/logger');

// ── الإعدادات ──
const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-3-small';
const EMBED_DIMENSIONS = 1536;
const EMBED_TIMEOUT = 30000; // 30 ثانية

/**
 * تحويل نص إلى vector embedding
 * @param {string} text - النص المراد تحويله
 * @returns {Promise<number[]|null>} متجه 1536 أبعاد أو null عند الفشل
 */
const embedText = async (text) => {
    if (!text || !text.trim()) return null;

    if (!process.env.OPENAI_API_KEY) {
        logger.error('[Embedder] مفتاح OPENAI_API_KEY غير موجود — لا يمكن توليد embeddings');
        return null;
    }

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/embeddings',
            {
                model: EMBED_MODEL,
                input: text.trim().slice(0, 8000), // حد OpenAI
                dimensions: EMBED_DIMENSIONS,
                encoding_format: 'float'
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: EMBED_TIMEOUT
            }
        );

        return response.data?.data?.[0]?.embedding || null;
    } catch (err) {
        logger.error('[Embedder] فشل في توليد embedding:', {
            error: err.response?.data?.error?.message || err.message,
            status: err.response?.status
        });
        return null;
    }
};

/**
 * تحويل مجموعة نصوص إلى embeddings دفعة واحدة (للتوفير)
 * OpenAI يسمح بـ 2048 نص في طلب واحد
 * @param {string[]} texts - مصفوفة النصوص
 * @returns {Promise<number[][]|null>} مصفوفة المتجهات
 */
const embedBatch = async (texts) => {
    if (!texts || texts.length === 0) return [];

    const cleanTexts = texts
        .map(t => (t || '').trim())
        .filter(t => t.length > 0);

    if (cleanTexts.length === 0) return [];

    if (!process.env.OPENAI_API_KEY) {
        logger.error('[Embedder] مفتاح OPENAI_API_KEY غير موجود');
        return null;
    }

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/embeddings',
            {
                model: EMBED_MODEL,
                input: cleanTexts.map(t => t.slice(0, 8000)),
                dimensions: EMBED_DIMENSIONS,
                encoding_format: 'float'
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: EMBED_TIMEOUT * 2
            }
        );

        return response.data?.data?.map(d => d.embedding) || null;
    } catch (err) {
        logger.error('[Embedder] فشل في توليد batch embeddings:', {
            error: err.response?.data?.error?.message || err.message,
            count: cleanTexts.length
        });
        return null;
    }
};

module.exports = { embedText, embedBatch };
