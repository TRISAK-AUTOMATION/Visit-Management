// utils/overlap.js - ตรวจช่วงเวลาทับซ้อน (ฟังก์ชันล้วน ทดสอบได้)
const toMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};

// ช่วง [aFrom,aTo) ทับ [bFrom,bTo) ไหม (รูปแบบ "HH:MM"); ถ้าไม่ครบเวลา ถือว่าเต็มวัน (ทับ)
function timesOverlap(aFrom, aTo, bFrom, bTo) {
  const a1 = toMin(aFrom), a2 = toMin(aTo), b1 = toMin(bFrom), b2 = toMin(bTo);
  if ([a1, a2, b1, b2].some((v) => v === null)) return true;
  return a1 < b2 && b1 < a2;
}

// ช่วงเวลาของการลาในวันหนึ่ง: คืน [from,to] ("HH:MM") ที่ใช้เทียบกับ Visit
function leaveWindow(mode, timeFrom, timeTo) {
  if (mode === 'half_day_morning') return ['00:00', '12:00'];
  if (mode === 'half_day_afternoon') return ['12:00', '23:59'];
  if (mode === 'hours' && timeFrom && timeTo) return [timeFrom, timeTo];
  return ['00:00', '23:59'];
}

module.exports = { timesOverlap, leaveWindow, toMin };
