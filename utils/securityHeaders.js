// utils/securityHeaders.js - ส่วนหัว (header) ความปลอดภัยพื้นฐาน (แทน helmet เพื่อไม่ต้องติดตั้งแพ็กเกจเพิ่ม)
// ไม่ตั้ง Content-Security-Policy เพราะหน้าเว็บใช้ฟอนต์/สคริปต์ภายนอกบางส่วน ตั้งผิดแล้วหน้าจะพัง
module.exports = function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
};
