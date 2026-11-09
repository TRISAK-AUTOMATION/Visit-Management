// client/src/lib/companies.js - บริษัทในเครือ (ใช้เลือก "ทำ OT ให้บริษัทไหน")
// ต้องตรงกับ utils/companies.js ฝั่ง server
export const COMPANIES = [
  { code: 'TAC', name: 'TRISAK AUTOMATION CO., LTD.' },
  { code: 'FAC', name: 'FACTORY AUTOMATION CENTRE CO., LTD.' },
  { code: 'HTC', name: 'HYTRON-TRISAK CO., LTD.' }
];
export const companyName = (code) => (COMPANIES.find(c => c.code === code) || {}).name || '';
// "FAC" -> "FACTORY AUTOMATION CENTRE CO., LTD." (ชื่อเต็มอย่างเดียว ไม่ต่อท้ายตัวย่อ)
export const companyLabel = (code) => companyName(code) || code || '';
