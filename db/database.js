// db/database.js
// เชื่อมต่อฐานข้อมูล SQLite และสร้างตารางทั้งหมด (schema) ของระบบ TRISAK Visit Management
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'trisak.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- SCHEMA ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  position      TEXT,          -- ตำแหน่งงาน เช่น Sales Engineer
  department    TEXT,          -- แผนก
  role          TEXT NOT NULL DEFAULT 'Employee', -- Employee | Approver | Admin
  avatar_url    TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT UNIQUE NOT NULL,     -- CUS-001
  name           TEXT NOT NULL,
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visit_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT UNIQUE NOT NULL,     -- VR-2026-00001
  requester_id    INTEGER NOT NULL REFERENCES users(id),
  customer_id     INTEGER NOT NULL REFERENCES customers(id),
  visit_date      TEXT NOT NULL,            -- YYYY-MM-DD
  time_from       TEXT NOT NULL,            -- HH:MM (เวลาเริ่มตามแผน)
  time_to         TEXT NOT NULL,            -- HH:MM (เวลาสิ้นสุดตามแผน)
  purpose         TEXT NOT NULL,            -- วัตถุประสงค์ / รายละเอียดงาน
  location         TEXT,                     -- สถานที่
  contact_person  TEXT,                     -- ผู้ติดต่อ (คนติดต่อ)
  contact_phone   TEXT,
  transport       TEXT,                     -- ยานพาหนะ
  license_plate   TEXT,                     -- ทะเบียนรถ
  notes           TEXT,                     -- Remark
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | cancelled
  approver_id     INTEGER REFERENCES users(id),
  approved_at     TEXT,
  approval_note   TEXT,
  created_at      TEXT DEFAULT (datetime('now')),

  -- ฟิลด์เพิ่มเติมตามแบบฟอร์ม Google Sheet เดิม / ใบรายงานการปฏิบัติงาน
  job_type          TEXT,    -- ประเภทงาน (Job Type)
  sales_person      TEXT,    -- ผู้ดูแลการขาย (Sales) ถ้าต่างจากผู้ขอ
  mileage_out       REAL,    -- ไมล์ออก
  mileage_in        REAL,    -- ไมล์เข้า
  actual_time_out   TEXT,    -- เวลาออกจริง
  actual_time_back  TEXT,    -- เวลากลับจริง
  ot_hours          REAL,    -- จำนวนชั่วโมง OT
  product           TEXT,    -- สินค้า/อุปกรณ์ที่เกี่ยวข้อง
  participants      TEXT,    -- ผู้ร่วมงาน (ชื่อคั่นด้วยคอมมา)
  customer_tax_id   TEXT,    -- เลขประจำตัวผู้เสียภาษีลูกค้า (Cus. TAX ID)
  tax_invoice_date  TEXT     -- วันที่ออกใบกำกับภาษี (TAX ID & Date)
);

CREATE TABLE IF NOT EXISTS approval_history (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_request_id INTEGER NOT NULL REFERENCES visit_requests(id),
  action_by        INTEGER REFERENCES users(id),
  action           TEXT NOT NULL,   -- ส่งคำขอ | อนุมัติ | ไม่อนุมัติ | แจ้งผลกลับ
  note             TEXT,
  created_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,     -- new_request | approved | rejected | reminder
  message     TEXT NOT NULL,
  related_id  INTEGER,           -- visit_request id
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- โทเคนสำหรับอนุมัติ/ไม่อนุมัติผ่านลิงก์ในอีเมล (Approve/Reject via Email)
CREATE TABLE IF NOT EXISTS approval_tokens (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  token             TEXT UNIQUE NOT NULL,
  visit_request_id  INTEGER NOT NULL REFERENCES visit_requests(id),
  approver_id       INTEGER NOT NULL REFERENCES users(id),
  action            TEXT NOT NULL,   -- approve | reject
  used_at           TEXT,
  expires_at        TEXT NOT NULL,
  created_at        TEXT DEFAULT (datetime('now'))
);

-- System Logs: บันทึกการกระทำสำคัญของผู้ใช้งานในระบบ (audit trail)
CREATE TABLE IF NOT EXISTS system_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,     -- เช่น login | logout | create_request | submit_request ...
  details     TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ===== FORM BUILDER (Admin CMS) =====
-- Field ที่ Admin เพิ่มเองจากหลังบ้าน (ไม่กระทบคอลัมน์เดิมของ visit_requests เลย
-- เพื่อไม่ให้ PDF / Report / Email ชุดเดิมที่อ้างอิงชื่อคอลัมน์ตรงๆ พัง)
CREATE TABLE IF NOT EXISTS custom_form_fields (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  field_key     TEXT UNIQUE NOT NULL,   -- ใช้อ้างอิงในโค้ด/DB เช่น project_number (a-z0-9_ เท่านั้น)
  label         TEXT NOT NULL,
  field_type    TEXT NOT NULL DEFAULT 'text', -- text|textarea|number|email|phone|date|time|datetime|dropdown|multiselect|checkbox|radio|file
  placeholder   TEXT,
  description   TEXT,
  options       TEXT,                    -- JSON array string สำหรับ dropdown/multiselect/radio เช่น ["ตัวเลือก1","ตัวเลือก2"]
  is_required   INTEGER NOT NULL DEFAULT 0,
  default_value TEXT,
  show_in_email INTEGER NOT NULL DEFAULT 0, -- ใช้ในเฟสถัดไป (Email Template)
  is_active     INTEGER NOT NULL DEFAULT 1, -- ปิดใช้งาน = ไม่แสดงในฟอร์มใหม่ แต่ข้อมูลเก่ายังอยู่
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- ค่าที่กรอกจริงของแต่ละคำขอ Visit สำหรับ field ที่ Admin สร้างเอง
-- หมายเหตุ: field_id ไม่ใส่ FOREIGN KEY บังคับไปที่ custom_form_fields เพราะเราต้องการให้ Admin ลบนิยาม Field ได้
-- โดยข้อมูลเก่าที่เคยกรอกไว้ในคำขอ Visit เก่ายังอยู่ใน DB เสมอ (ไม่ถูกลบตาม) เพียงแต่จะไม่มี label ให้แสดงอีกต่อไป
CREATE TABLE IF NOT EXISTS visit_custom_values (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_request_id  INTEGER NOT NULL REFERENCES visit_requests(id),
  field_id          INTEGER NOT NULL,
  value             TEXT,
  UNIQUE(visit_request_id, field_id)
);

-- ===== CORE FIELD SETTINGS =====
-- ตั้งค่า "ซ่อน/แสดง" และ "เปลี่ยนชื่อ Label" ของ Field เดิมของระบบ (ที่ผูกกับคอลัมน์จริงใน visit_requests)
-- เจตนา: ไม่ลบคอลัมน์เดิมเด็ดขาด (PDF / Report / Email เดิมอ้างอิงชื่อคอลัมน์ตรงๆ) แต่ให้ Admin ซ่อนจากหน้า "สร้างคำขอ Visit" ได้แทน
-- field ที่จำเป็นต่อ logic หลักของระบบ (ลูกค้า, วันที่, เวลา, วัตถุประสงค์) ไม่อยู่ในตารางนี้ เพราะห้ามซ่อน/ห้ามถอด required
CREATE TABLE IF NOT EXISTS core_field_settings (
  field_key    TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  is_visible   INTEGER NOT NULL DEFAULT 1,
  is_required  INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT DEFAULT (datetime('now')),
  updated_by   INTEGER REFERENCES users(id)
);
`);

// seed ค่าเริ่มต้นของ core_field_settings ครั้งแรก (คงชื่อ Label เดิมทุกตัวไว้ ไม่เปลี่ยนพฤติกรรมเดิม)
// ใช้ INSERT OR IGNORE จึงไม่ทับค่าที่ Admin เคยแก้ไว้แล้วในการรันครั้งถัดๆ ไป
const CORE_FIELD_DEFAULTS = [
  ['job_type', 'ประเภทงาน (Job Type)'],
  ['sales_person', 'ผู้ดูแลการขาย (Sales)'],
  ['location', 'สถานที่'],
  ['contact_person', 'ผู้ติดต่อ'],
  ['contact_phone', 'เบอร์โทร'],
  ['product', 'สินค้า/อุปกรณ์ที่เกี่ยวข้อง'],
  ['participants', 'ผู้ร่วมงาน'],
  ['transport', 'ยานพาหนะ'],
  ['license_plate', 'ทะเบียนรถ'],
  ['mileage_out', 'ไมล์ออก'],
  ['mileage_in', 'ไมล์เข้า'],
  ['actual_time_out', 'เวลาออกจริง'],
  ['actual_time_back', 'เวลากลับจริง'],
  ['ot_hours', 'จำนวนชั่วโมง OT'],
  ['customer_tax_id', 'เลขประจำตัวผู้เสียภาษีลูกค้า (Cus. TAX ID)'],
  ['tax_invoice_date', 'วันที่ออกใบกำกับภาษี (TAX ID & Date)'],
  ['notes', 'รายละเอียดเพิ่มเติม (Remark)']
];
{
  const insertDefault = db.prepare('INSERT OR IGNORE INTO core_field_settings (field_key, label) VALUES (?, ?)');
  const tx = db.transaction((rows) => { rows.forEach(([k, l]) => insertDefault.run(k, l)); });
  tx(CORE_FIELD_DEFAULTS);
}

// เพิ่มคอลัมน์ email_notify ให้ users เดิม (เผื่อฐานข้อมูลถูกสร้างไว้ก่อนหน้านี้)
const userCols = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
if (!userCols.includes('email_notify')) {
  db.exec(`ALTER TABLE users ADD COLUMN email_notify INTEGER NOT NULL DEFAULT 1`);
}
// is_active: เปิด/ปิดการใช้งานบัญชี (ทำโดย Admin) — default เปิดใช้งานอยู่แล้ว
if (!userCols.includes('is_active')) {
  db.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`);
}

// เพิ่มคอลัมน์ channel ให้ approval_history เดิม (บันทึกว่าดำเนินการผ่านเว็บแอปหรืออีเมล)
const historyCols = db.prepare(`PRAGMA table_info(approval_history)`).all().map(c => c.name);
if (!historyCols.includes('channel')) {
  db.exec(`ALTER TABLE approval_history ADD COLUMN channel TEXT`);
}
// เพิ่มคอลัมน์ tax_id ให้ customers เดิม (เลขประจำตัวผู้เสียภาษีของลูกค้า สำหรับ auto-fill ตอนสร้างคำขอ)
const customerCols = db.prepare(`PRAGMA table_info(customers)`).all().map(c => c.name);
if (!customerCols.includes('tax_id')) {
  db.exec(`ALTER TABLE customers ADD COLUMN tax_id TEXT`);
}
// เพิ่มคอลัมน์ position_after ให้ custom_form_fields เดิม
// ใช้กำหนดตำแหน่งของ field ที่ Admin สร้างเองว่าจะให้แสดง "หลัง field ไหน" ในฟอร์ม (รวมถึง core field เดิม)
// ค่าว่าง '' = ท้ายฟอร์ม (ค่าเริ่มต้น เหมือนพฤติกรรมเดิมก่อนมีฟีเจอร์นี้), 'TOP' = บนสุดของฟอร์ม, หรือ field_key ของ field ใดๆ ก็ได้ (core หรือ custom)
const customFieldCols = db.prepare(`PRAGMA table_info(custom_form_fields)`).all().map(c => c.name);
if (!customFieldCols.includes('position_after')) {
  db.exec(`ALTER TABLE custom_form_fields ADD COLUMN position_after TEXT NOT NULL DEFAULT ''`);
}
module.exports = db;
