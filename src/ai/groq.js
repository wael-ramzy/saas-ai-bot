const axios = require('axios');
require('dotenv').config({ 
    path: require('path').join(__dirname, '..', '..', 'config', '.env') 
});

const { buildMessages, updateMemory } = require('./memory');
const { parseOrder, cleanReply } = require('./parser');
const { buildRestaurantPrompt } = require('./prompts/restaurant');

const getAIResponse = async (chatId, userMessage, client, customer) => {
    const customerContext = customer ? `
[عميل قديم - لا تطلب بياناته]
الاسم: ${customer.customer_name}
الهاتف: ${customer.customer_phone}
العنوان: ${customer.address}
آخر طلب: ${customer.last_order || 'لا يوجد'}
    ` : '';

    const systemPrompt = buildRestaurantPrompt(
        client.client_name,
        client.menu_text || 'المنيو غير متوفر',
        customerContext
    );

    const messages = buildMessages(chatId, systemPrompt, userMessage);

    try {
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.3-70b-versatile',
                messages,
                temperature: 0.5
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const fullReply = response.data.choices[0].message.content;
        const order = parseOrder(fullReply);
        const reply = cleanReply(fullReply);

        updateMemory(chatId, userMessage, reply);

        return { reply, order };
    } catch (err) {
        console.error('Groq Error:', err.message);
        return { 
            reply: 'يا فندم حصل مشكلة بسيطة، دقائق وأكون معاك.', 
            order: null 
        };
    }
};

module.exports = { getAIResponse };