# ═══════════════════════════════════════════════════════════════
# Dockerfile — SaaS AI Bot Platform
# ═══════════════════════════════════════════════════════════════
# لا حاجة لـ Puppeteer — نستخدم Meta Cloud APIs الرسمية
# الصورة صغيرة (~150MB) وسريعة البناء

FROM node:20-alpine AS base

# ── مجلد العمل ──
WORKDIR /app

# ── التبعيات ──
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-fund --no-audit

# ── الكود ──
COPY . .

# ── بيئة الإنتاج ──
ENV NODE_ENV=production
ENV PORT=3000

# ── فحص الصحة ──
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget -qO- http://localhost:3000/health || exit 1

# ── التشغيل ──
EXPOSE 3000
CMD ["node", "src/server.js"]
