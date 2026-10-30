// lib/contentCatalog.js - รายการข้อความที่ Admin ปรับได้ (ค่าเริ่มต้นอยู่ที่นี่/ในหน้าจริง; ค่าที่ Admin แก้เก็บใน page_content)
import { MENU_CATALOG } from '../components/Layout';

// ชื่อหน้า (Page Title) — 7 รายการแรกใช้ key รุ่นเดิม ที่เหลือใช้ page.<path> (Layout ดึงตาม path ให้อัตโนมัติ)
const P = (path, def, key) => ({ key: key || `page.${path}`, label: def, group: 'ชื่อหน้า (Page Title)', hint: path });
export const PAGE_TITLES = [
  P('/dashboard', 'Dashboard', 'dashboard.title'), P('/my-requests', 'My Requests', 'my_requests.title'),
  P('/approve-requests', 'Approve Requests', 'approve_requests.title'), P('/calendar', 'ปฏิทิน', 'calendar.title'),
  P('/customers', 'Customer', 'customers.title'), P('/report', 'Report', 'report.title'), P('/notifications', 'Notifications', 'notifications.title'),
  P('/profile', 'โปรไฟล์ของฉัน'), P('/my-team', 'ทีมของฉัน (My Team)'), P('/settings', 'ตั้งค่า'),
  P('/my-leave', 'การลาของฉัน (My Leave)'), P('/my-ot', 'OT ของฉัน (My Overtime)'),
  P('/approve-leave', 'อนุมัติการลา (Approve Leave)'), P('/approve-ot', 'อนุมัติ OT (Approve Overtime)'),
  P('/admin-users', 'จัดการผู้ใช้งาน (User Management)'), P('/admin-leave-balances', 'จัดการสิทธิ์วันลา (Leave Balances)'),
  P('/admin-form-builder', 'Form Builder — สร้างคำขอ Visit'), P('/admin-brands', 'Brand Master'),
  P('/admin-page-content', 'จัดการหน้า/หัวข้อของระบบ'), P('/admin-approval-templates', 'Template อนุมัติ (Approval Templates)'),
  P('/admin-data-retention', 'ตั้งค่าการลบข้อมูลอัตโนมัติ (Data Retention)'), P('/admin-system-logs', 'System Logs'),
  P('/admin-email-settings', 'ตั้งค่าอีเมล'), P('/admin-pdf-settings', 'ออกแบบ PDF'),
  P('/admin-profile-permissions', 'มอบสิทธิ์ผู้ประเมิน (Profile Edit Permissions)')
];

export const MENUS = MENU_CATALOG.map(m => ({ ...m, hint: m.key.replace('menu.', '') }));

const SEC = [
  ['s1', 'Request Detail', 'รายละเอียดการเข้าพบลูกค้า', 'Request Detail', false],
  ['s2', 'Visit Objective', 'วัตถุประสงค์การเข้าพบ', 'Objective', true],
  ['s3', 'During Visit', 'ข้อมูลที่พบระหว่างการเข้าพบ', 'During Visit', true],
  ['s4', 'Opportunity Summary', 'สรุปโอกาสทางธุรกิจ', 'Opportunity Summary', true],
  ['s5', 'Action Plan', 'แผนดำเนินงาน', 'Action Plan', true],
  ['s6', 'Customer Level', 'ระดับลูกค้า', 'Customer Level', true],
  ['s7', 'Next Visit', 'การเข้าพบครั้งถัดไป', 'Next Visit', true],
  ['s8', 'Remark', 'หมายเหตุ', 'Remark', true],
  ['s9', 'Additional Information', 'ข้อมูลเพิ่มเติม', 'Additional Info', false]
];
const SUB = [
  ['3.1', 'Current Products / Brands', 'สินค้า/ยี่ห้อที่ลูกค้าใช้อยู่'], ['3.2', 'Recurring Part Demand', 'ความต้องการอะไหล่/สินค้าต่อเนื่อง'],
  ['3.3', 'Customer Problem / Improvement', 'ปัญหา/สิ่งที่ลูกค้าต้องการปรับปรุง'], ['3.4', 'Upcoming Project / Future Plan', 'โครงการ/แผนในอนาคตของลูกค้า'],
  ['3.5', 'Potential Product Opportunity', 'โอกาสสินค้าที่ Trisak นำเสนอได้']
];
const GRP = [
  ['Company Information', 'ข้อมูลบริษัท'], ['Customer Information', 'ข้อมูลลูกค้า'], ['Contact Information', 'ข้อมูลผู้ติดต่อ'],
  ['Visit Information', 'ข้อมูลการเข้าพบ'], ['Trip & Post-visit Details', 'ข้อมูลการเดินทางและหลังปฏิบัติงาน'], ['Accompanied Employees', 'ผู้ร่วมงาน'],
  ['What did we find?', 'เราพบอะไรจากการเข้าพบ'], ['Opportunity Level', 'ระดับโอกาส'], ['Opportunity Description', 'รายละเอียดโอกาส'], ['Action Plan Table', 'ตารางแผนดำเนินงาน']
];

export const FORM_ROWS = [];
SEC.forEach(([id, en, th, nav, canHide]) => {
  const g = `หัวข้อหลัก ${id.replace('s', '')}`;
  FORM_ROWS.push({ key: `form.${id}.title`, label: `${id.replace('s', '')}. ชื่อ (EN)`, def: en, group: 'ฟอร์ม Visit — หัวข้อหลัก', sub: g });
  FORM_ROWS.push({ key: `form.${id}.th`, label: `${id.replace('s', '')}. คำอธิบาย (TH)`, def: th, group: 'ฟอร์ม Visit — หัวข้อหลัก', sub: g });
  FORM_ROWS.push({ key: `form.${id}.nav`, label: `${id.replace('s', '')}. ชื่อในเมนูซ้าย`, def: nav, group: 'ฟอร์ม Visit — หัวข้อหลัก', sub: g });
  if (canHide) FORM_ROWS.push({ key: `form.${id}.hidden`, label: `${id.replace('s', '')}. ซ่อนหัวข้อนี้`, toggle: true, group: 'ฟอร์ม Visit — หัวข้อหลัก', sub: g });
});
SUB.forEach(([no, en, th]) => {
  FORM_ROWS.push({ key: `form.sub.${no}.title`, label: `${no} ชื่อ (EN)`, def: en, group: 'ฟอร์ม Visit — หัวข้อย่อย 3.1–3.5', sub: `หัวข้อย่อย ${no}` });
  FORM_ROWS.push({ key: `form.sub.${no}.th`, label: `${no} คำอธิบาย (TH)`, def: th, group: 'ฟอร์ม Visit — หัวข้อย่อย 3.1–3.5', sub: `หัวข้อย่อย ${no}` });
  FORM_ROWS.push({ key: `form.sub.${no}.hidden`, label: `${no} ซ่อนหัวข้อย่อยนี้`, toggle: true, group: 'ฟอร์ม Visit — หัวข้อย่อย 3.1–3.5', sub: `หัวข้อย่อย ${no}` });
});
GRP.forEach(([en, th]) => {
  FORM_ROWS.push({ key: `form.group.${en}.title`, label: `${en} (EN)`, def: en, group: 'ฟอร์ม Visit — กลุ่มย่อยในหน้า', sub: en });
  FORM_ROWS.push({ key: `form.group.${en}.th`, label: `${en} (TH)`, def: th, group: 'ฟอร์ม Visit — กลุ่มย่อยในหน้า', sub: en });
});
