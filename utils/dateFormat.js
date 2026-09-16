// utils/dateFormat.js
// แปลงวันที่รูปแบบ ISO ("YYYY-MM-DD" หรือ "YYYY-MM-DD HH:mm:ss") ให้เป็นรูปแบบไทย "DD/MM/YYYY"
// ใช้ร่วมกันทั้งในอีเมล, PDF และหน้าจอต่างๆ เพื่อไม่ให้เกิดบั๊กวันที่โชว์แบบสากลหลุดมาอีก
function toThaiDate(value) {
  if (!value) return '-';
  const datePart = String(value).slice(0, 10); // ตัดเวลาออกถ้ามี เหลือ YYYY-MM-DD
  const parts = datePart.split('-');
  if (parts.length !== 3) return String(value); // ไม่ใช่รูปแบบ ISO ที่รู้จัก ส่งค่าเดิมกลับไป
  const [y, m, d] = parts;
  if (!y || !m || !d) return String(value);
  return `${d}/${m}/${y}`;
}

module.exports = { toThaiDate };
