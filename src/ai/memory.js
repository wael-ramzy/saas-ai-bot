const { getSession, addMessage, injectCustomerContext } = require('../services/session');

// بناء قائمة الرسائل للـ AI
const buildMessages = (chatId, systemPrompt, userMessage) => {
    const history = getSession(chatId);
    
    return [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage }
    ];
};

// تحديث الذاكرة بعد كل رد
const updateMemory = (chatId, userMessage, aiReply) => {
    addMessage(chatId, 'user', userMessage);
    addMessage(chatId, 'assistant', aiReply);
};

module.exports = { buildMessages, updateMemory, injectCustomerContext };