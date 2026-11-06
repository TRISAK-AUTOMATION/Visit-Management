// utils/holidays.js - วันหยุดนักขัตฤกษ์/วันหยุดบริษัท (Admin กรอกเอง) ใช้ตัดออกจากการนับวันลาแบบเต็มวัน
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// นับวันปฏิทินจาก..ถึง (รวมสองวัน) โดยไม่นับวันที่อยู่ใน holidaySet (Set ของ 'YYYY-MM-DD') — ฟังก์ชันล้วน
function countDaysExcluding(dateFrom, dateTo, holidaySet) {
  if (!isDate(dateFrom) || !isDate(dateTo) || dateTo < dateFrom) return 0;
  let n = 0;
  for (let d = dateFrom, guard = 0; d <= dateTo && guard < 400; d = addDays(d, 1), guard++) if (!holidaySet.has(d)) n++;
  return n;
}

function holidaySetBetween(db, from, to) {
  try {
    return new Set(db.prepare('SELECT holiday_date FROM holidays WHERE holiday_date BETWEEN ? AND ?').all(from, to).map((r) => r.holiday_date));
  } catch (e) { return new Set(); }   // ตารางยังไม่มี = ไม่มีวันหยุด (นับเหมือนเดิม)
}

module.exports = { countDaysExcluding, holidaySetBetween, isDate, addDays };
