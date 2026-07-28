const requests = {};

const isAllowed = (phone, maxPerMinute = 10) => {
    const now = Date.now();
    
    if (!requests[phone]) {
        requests[phone] = [];
    }

    // احذف الرسائل الأقدم من دقيقة
    requests[phone] = requests[phone].filter(t => now - t < 60000);

    if (requests[phone].length >= maxPerMinute) {
        return false;
    }

    requests[phone].push(now);
    return true;
};

module.exports = { isAllowed };