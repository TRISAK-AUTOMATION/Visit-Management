// utils/companies.js - บริษัทในเครือที่พนักงานทำงานให้ (ใช้เลือก "ทำ OT ให้บริษัทไหน")
// ต้องตรงกับ client/src/lib/companies.js
const COMPANIES = [
  { code: 'TAC', name: 'TRISAK AUTOMATION CO., LTD.' },
  { code: 'FAC', name: 'FACTORY AUTOMATION CENTRE CO., LTD.' },
  { code: 'HTC', name: 'HYTRON-TRISAK CO., LTD.' }
];
const COMPANY_CODES = COMPANIES.map(c => c.code);
const companyName = (code) => (COMPANIES.find(c => c.code === code) || {}).name || '';
// "FAC" -> "FACTORY AUTOMATION CENTRE CO., LTD." (ชื่อเต็มอย่างเดียว ไม่ต่อท้ายตัวย่อ)
const companyLabel = (code) => companyName(code) || code || '';

module.exports = { COMPANIES, COMPANY_CODES, companyName, companyLabel };
