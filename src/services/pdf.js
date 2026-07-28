const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const extractMenuFromPdf = async (pdfPath) => {
    try {
        if (!fs.existsSync(pdfPath)) {
            console.warn('ملف PDF غير موجود:', pdfPath);
            return null;
        }
        const buffer = fs.readFileSync(pdfPath);
        const data = await pdf(buffer);
        console.log('[✓] تم استخراج نص المنيو من PDF');
        return data.text;
    } catch (err) {
        console.error('خطأ في قراءة PDF:', err.message);
        return null;
    }
};

module.exports = { extractMenuFromPdf };