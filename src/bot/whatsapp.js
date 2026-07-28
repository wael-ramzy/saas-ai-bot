const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');

const createWhatsAppClient = () => {
    return new Client({
        authStrategy: new LocalAuth({
            dataPath: path.join(__dirname, '..', '..', 'data', 'session')
        }),
        puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    });
};

module.exports = { createWhatsAppClient };