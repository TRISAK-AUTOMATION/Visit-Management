// tests/utils.test.js - ทดสอบฟังก์ชันล้วนที่ไม่ต้องใช้ฐานข้อมูล   รัน: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { timesOverlap, leaveWindow } = require('../utils/overlap');
const { countDaysExcluding, addDays } = require('../utils/holidays');
const { pickToDelete, stamp } = require('../utils/backup');

test('timesOverlap: ทับ/ไม่ทับ/ติดกัน/ไม่มีเวลา', () => {
  assert.equal(timesOverlap('09:00', '12:00', '11:00', '13:00'), true);
  assert.equal(timesOverlap('09:00', '12:00', '12:00', '13:00'), false);   // ชนขอบ = ไม่ทับ
  assert.equal(timesOverlap('09:00', '10:00', '14:00', '16:00'), false);
  assert.equal(timesOverlap('', '', '14:00', '16:00'), true);              // ไม่รู้เวลา ถือว่าทั้งวัน
});

test('leaveWindow: ลาครึ่งวันเช้า/บ่าย/รายชั่วโมง', () => {
  assert.deepEqual(leaveWindow('half_day_morning'), ['00:00', '12:00']);
  assert.deepEqual(leaveWindow('half_day_afternoon'), ['12:00', '23:59']);
  assert.deepEqual(leaveWindow('hours', '13:00', '15:00'), ['13:00', '15:00']);
  assert.equal(timesOverlap('09:00', '16:00', ...leaveWindow('half_day_morning')), true);
  assert.equal(timesOverlap('13:00', '16:00', ...leaveWindow('half_day_morning')), false);
});

test('countDaysExcluding: ตัดวันหยุด', () => {
  const hol = new Set(['2026-04-14', '2026-04-15']);
  assert.equal(countDaysExcluding('2026-04-13', '2026-04-16', hol), 2);
  assert.equal(countDaysExcluding('2026-04-14', '2026-04-15', hol), 0);
  assert.equal(countDaysExcluding('2026-04-13', '2026-04-13', new Set()), 1);
  assert.equal(countDaysExcluding('2026-04-16', '2026-04-13', new Set()), 0);   // ช่วงกลับด้าน
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

test('pickToDelete: เก็บชุดล่าสุด ลบชุดเก่า ไม่แตะไฟล์อื่น', () => {
  const names = ['trisak-20260101-0100.db', 'trisak-20260103-0100.db', 'trisak-20260102-0100.db', 'notes.txt'];
  assert.deepEqual(pickToDelete(names, 2), ['trisak-20260101-0100.db']);
  assert.deepEqual(pickToDelete(names, 5), []);
  assert.match(stamp(new Date(2026, 10, 3, 9, 5)), /^20261103-0905$/);
});
