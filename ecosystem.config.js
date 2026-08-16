/**
 * PM2 Ecosystem Configuration
 * ═══════════════════════════
 * التشغيل: pm2 start ecosystem.config.js
 * 
 * الميزات:
 * - Cluster mode: توازن الحمل بين العمليات
 * - Auto-restart عند الانهيار
 * - Memory limit: إعادة تشغيل إذا تجاوز 512MB
 * - Logs منفصلة
 */

module.exports = {
    apps: [
        {
            name: 'saas-ai-bot',
            script: 'src/server.js',
            instances: 1, // يمكن تغييره إلى 'max' للتشغيل المتعدد
            exec_mode: 'fork', // fork لأننا نحمل state (sessions) في الذاكرة
            max_memory_restart: '512M',
            env: {
                NODE_ENV: 'production',
                PORT: 3000
            },
            error_file: './logs/error.log',
            out_file: './logs/out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,
            autorestart: true,
            watch: false,
            max_restarts: 10,
            min_uptime: '10s',
            kill_timeout: 5000
        }
    ]
};
