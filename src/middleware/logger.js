const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

const log = (level, message, data = '') => {
    const time = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });
    const line = `[${time}] [${level}] ${message} ${data ? JSON.stringify(data) : ''}\n`;
    
    console.log(line.trim());
    
    fs.appendFileSync(
        path.join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`),
        line
    );
};

module.exports = {
    info:  (msg, data) => log('INFO',  msg, data),
    error: (msg, data) => log('ERROR', msg, data),
    warn:  (msg, data) => log('WARN',  msg, data)
};