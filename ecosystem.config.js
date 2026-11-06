// ecosystem.config.js - รันระบบด้วย pm2 ให้เปิดเองเมื่อเครื่องรีสตาร์ทและรีสตาร์ทอัตโนมัติถ้าล่ม
// ใช้: npm i -g pm2 && pm2 start ecosystem.config.js && pm2 save   (Windows: ใช้ pm2-windows-startup หรือ NSSM)
module.exports = {
  apps: [{
    name: 'trisak-visit',
    script: 'server.js',
    env: { NODE_ENV: 'production' },   // ต้องตั้ง SESSION_SECRET ใน .env ก่อน
    max_restarts: 20,
    restart_delay: 3000
  }]
};
