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

-- ผู้ใช้ 1 คน ดูแลได้หลายแผนก (many-to-many) - ใช้คู่กับ users.department (แผนกหลัก/แผนกแรก) เพื่อความเข้ากันได้กับของเดิม
CREATE TABLE IF NOT EXISTS user_departments (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  PRIMARY KEY (user_id, department)
);

-- ===== ระบบลา (Leave Management) =====
CREATE TABLE IF NOT EXISTS leave_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT UNIQUE NOT NULL,       -- LV-2026-00001
  requester_id    INTEGER NOT NULL REFERENCES users(id),
  leave_type      TEXT NOT NULL,              -- ลากิจ | ลาป่วย | ลาพักร้อน
  leave_mode      TEXT NOT NULL,              -- full_day | half_day_morning | half_day_afternoon | hours
  date_from       TEXT NOT NULL,              -- YYYY-MM-DD
  date_to         TEXT NOT NULL,              -- YYYY-MM-DD (เท่ากับ date_from ถ้าลาวันเดียว/ครึ่งวัน/ชั่วโมง)
  time_from       TEXT,                       -- HH:MM ใช้เมื่อ leave_mode = hours
  time_to         TEXT,
  duration_days   REAL NOT NULL DEFAULT 0,    -- นับเป็นวัน (เต็มวัน=1, ครึ่งวัน=0.5, ลาชม.=0)
  duration_hours  REAL NOT NULL DEFAULT 0,    -- นับเป็นชั่วโมง (ใช้เมื่อ leave_mode = hours, ลา 30 นาที = 0.5)
  reason          TEXT NOT NULL,
  attachment      TEXT,                       -- เอกสารแนบ (data URL, ถ้ามี)
  status          TEXT NOT NULL DEFAULT 'pending', -- draft | pending | approved | rejected | cancelled
  approver_id     INTEGER REFERENCES users(id),
  approved_at     TEXT,
  approval_note   TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leave_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  leave_request_id  INTEGER NOT NULL REFERENCES leave_requests(id),
  action_by         INTEGER REFERENCES users(id),
  action            TEXT NOT NULL,   -- ส่งคำขอ | อนุมัติ | ไม่อนุมัติ | ยกเลิก
  note              TEXT,
  created_at        TEXT DEFAULT (datetime('now'))
);

-- สิทธิ์/โควตาการลารายบุคคล กำหนดโดย Admin (เผื่อพนักงานเริ่มงานระหว่างปี สิทธิ์ไม่เท่ากัน)
CREATE TABLE IF NOT EXISTS leave_balances (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vacation_total   REAL NOT NULL DEFAULT 6,   -- สิทธิ์ลาพักร้อนต่อปี (วัน)
  vacation_used    REAL NOT NULL DEFAULT 0,   -- ใช้ไปแล้ว (วัน) - อัปเดตอัตโนมัติเมื่อคำขอลาพักร้อนถูกอนุมัติ
  personal_total   REAL NOT NULL DEFAULT 3,   -- สิทธิ์ลากิจต่อปี (วัน) - ไม่มีขั้นต่ำตามกฎหมาย ปรับได้ตามนโยบายบริษัท
  personal_used    REAL NOT NULL DEFAULT 0,
  sick_total       REAL NOT NULL DEFAULT 30,  -- สิทธิ์ลาป่วยแบบได้ค่าจ้างต่อปี (วัน) - ตามกฎหมายแรงงานไทยสูงสุด 30 วัน/ปี
  sick_used        REAL NOT NULL DEFAULT 0,
  note             TEXT,
  updated_at       TEXT DEFAULT (datetime('now'))
);

-- ===== ระบบขอทำงานล่วงเวลา (OT Management) =====
CREATE TABLE IF NOT EXISTS ot_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT UNIQUE NOT NULL,        -- OT-2026-00001
  requester_id    INTEGER NOT NULL REFERENCES users(id),
  ot_date         TEXT NOT NULL,               -- วันที่ทำ OT
  time_from       TEXT NOT NULL,
  time_to         TEXT NOT NULL,
  hours           REAL NOT NULL DEFAULT 0,     -- คำนวณจากเวลาเริ่ม-สิ้นสุดอัตโนมัติ
  location        TEXT,                        -- สถานที่ปฏิบัติงาน
  customer_id     INTEGER REFERENCES customers(id), -- ลูกค้า/โปรเจกต์ (ไม่บังคับ - ใช้เมื่อ OT เกี่ยวข้องกับลูกค้า เช่นแผนก Engineer)
  project_no      TEXT,                        -- เลขที่โปรเจกต์ (ไม่บังคับ)
  type_service    TEXT,                        -- ประเภทงาน/บริการ (ไม่บังคับ)
  work_detail     TEXT NOT NULL,               -- รายละเอียดงานที่ทำ
  reason          TEXT,                        -- เหตุผลในการทำ OT
  notes           TEXT,                        -- หมายเหตุเพิ่มเติม
  status          TEXT NOT NULL DEFAULT 'pending', -- draft | pending | approved | rejected | cancelled
  approver_id     INTEGER REFERENCES users(id),
  approved_at     TEXT,
  approval_note   TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ot_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ot_request_id INTEGER NOT NULL REFERENCES ot_requests(id),
  action_by     INTEGER REFERENCES users(id),
  action        TEXT NOT NULL,
  note          TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ===== ระบบประเมินผลงาน (KPI) และสิทธิ์แก้ไขโปรไฟล์ =====
-- คะแนนรวม 5 ด้านต่อพนักงาน 1 คน (เป็นค่าล่าสุด/ปัจจุบัน ไม่ได้แยกเป็นรอบประเมินย้อนหลัง)
CREATE TABLE IF NOT EXISTS employee_kpi (
  user_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  attendance_score  INTEGER NOT NULL DEFAULT 0,  -- การมาทำงาน /100
  performance_score INTEGER NOT NULL DEFAULT 0,  -- ผลงาน /100
  responsibility_score INTEGER NOT NULL DEFAULT 0, -- ความรับผิดชอบ /100
  teamwork_score    INTEGER NOT NULL DEFAULT 0,  -- การทำงานเป็นทีม /100
  discipline_score  INTEGER NOT NULL DEFAULT 0,  -- ระเบียบวินัย /100
  late_count        INTEGER NOT NULL DEFAULT 0,  -- มาสาย (ครั้ง) - กรอกเอง ระบบยังไม่มีเครื่องสแกนนิ้ว
  absent_count      INTEGER NOT NULL DEFAULT 0,  -- ขาดงาน (ครั้ง) - กรอกเอง
  pending_tasks     INTEGER NOT NULL DEFAULT 0,  -- งานค้าง - กรอกเอง
  work_status       TEXT NOT NULL DEFAULT 'ปกติ', -- ป้ายสถานะการทำงานบนสุด เช่น ปกติ/ต้องปรับปรุง/ดีเด่น
  updated_by        INTEGER REFERENCES users(id),
  updated_at        TEXT DEFAULT (datetime('now'))
);

-- เช็คลิสต์ย่อยในแต่ละ KPI ด้าน (หัวหน้าพิมพ์เองได้อิสระ ไม่ผูก template ตายตัว)
CREATE TABLE IF NOT EXISTS employee_kpi_checklist (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,  -- attendance | performance | responsibility | teamwork | discipline
  label         TEXT NOT NULL,
  is_checked    INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT DEFAULT (datetime('now'))
);

-- Admin มอบสิทธิ์ "คนนี้แก้โปรไฟล์/คะแนนของคนนั้นได้" เพิ่มเติมนอกเหนือกฎแผนกเริ่มต้น (หัวหน้าแก้ได้เฉพาะแผนกตัวเอง)
CREATE TABLE IF NOT EXISTS profile_edit_permissions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  editor_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by      INTEGER REFERENCES users(id),
  created_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(editor_user_id, target_user_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL,            -- CUS-001 (unique ร่วมกับ company ไม่ใช่ unique เดี่ยว เพราะรหัสจาก SAP ของแต่ละบริษัทอาจซ้ำกันได้)
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

// เผื่อฐานข้อมูลถูกสร้างจากเวอร์ชันก่อนหน้าที่ยังไม่มีคอลัมน์ sort_order (ตารางมีอยู่แล้วแต่ยังไม่มีคอลัมน์นี้)
// ต้องรันก่อน seed ด้านล่าง เพราะ INSERT ด้านล่างอ้างอิงคอลัมน์นี้
const coreFieldCols = db.prepare(`PRAGMA table_info(core_field_settings)`).all().map(c => c.name);
if (!coreFieldCols.includes('sort_order')) {
  db.exec(`ALTER TABLE core_field_settings ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
}

// seed ค่าเริ่มต้นของ core_field_settings ครั้งแรก (คงชื่อ Label เดิมทุกตัวไว้ ไม่เปลี่ยนพฤติกรรมเดิม)
// ใช้ INSERT OR IGNORE จึงไม่ทับค่าที่ Admin เคยแก้ไว้แล้วในการรันครั้งถัดๆ ไป
// ลำดับของ array นี้ = ลำดับที่เคยแสดงผลแบบ hard-code เดิมในฟอร์ม ใช้เป็นค่า sort_order เริ่มต้น
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
  const insertDefault = db.prepare('INSERT OR IGNORE INTO core_field_settings (field_key, label, sort_order) VALUES (?, ?, ?)');
  const tx = db.transaction((rows) => { rows.forEach(([k, l], idx) => insertDefault.run(k, l, idx)); });
  tx(CORE_FIELD_DEFAULTS);
}
// ถ้าตารางมีอยู่ก่อนแล้ว (จากเวอร์ชันก่อนที่ยังไม่มี sort_order) ให้ backfill ลำดับตามที่เคย hard-code ไว้เดิม
// เฉพาะแถวที่ยังเป็นค่า default 0 ทั้งหมด (กันไม่ให้ทับลำดับที่ Admin เคยจัดเรียงเองไปแล้ว)
{
  const allZero = db.prepare('SELECT COUNT(*) c FROM core_field_settings WHERE sort_order != 0').get().c === 0;
  if (allZero) {
    const backfillOrder = db.prepare('UPDATE core_field_settings SET sort_order = ? WHERE field_key = ?');
    const tx2 = db.transaction((rows) => { rows.forEach(([k], idx) => backfillOrder.run(idx, k)); });
    tx2(CORE_FIELD_DEFAULTS);
  }
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
// company: บริษัทเจ้าของฐานข้อมูลลูกค้ารายนี้ (TAC / FAC / HTC) - ใช้แบ่งกลุ่มตอนนำเข้าจาก SAP
if (!customerCols.includes('company')) {
  db.exec(`ALTER TABLE customers ADD COLUMN company TEXT`);
}
// is_archived: ลูกค้าที่ถูก "ลบ" ออกจากการนำเข้ารอบล่าสุด แต่ยังมีคำขอ Visit เก่าอ้างอิงอยู่ จึงลบทิ้งจริงไม่ได้
// จะถูกซ่อนจากช่องค้นหาตอนสร้างคำขอใหม่ แต่ข้อมูลคำขอเก่ายังแสดงชื่อลูกค้าได้ปกติ
if (!customerCols.includes('is_archived')) {
  db.exec(`ALTER TABLE customers ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`);
}
// เพิ่มคอลัมน์ position_after ให้ custom_form_fields เดิม
// ใช้กำหนดตำแหน่งของ field ที่ Admin สร้างเองว่าจะให้แสดง "หลัง field ไหน" ในฟอร์ม (รวมถึง core field เดิม)
// ค่าว่าง '' = ท้ายฟอร์ม (ค่าเริ่มต้น เหมือนพฤติกรรมเดิมก่อนมีฟีเจอร์นี้), 'TOP' = บนสุดของฟอร์ม, หรือ field_key ของ field ใดๆ ก็ได้ (core หรือ custom)
const customFieldCols = db.prepare(`PRAGMA table_info(custom_form_fields)`).all().map(c => c.name);
if (!customFieldCols.includes('position_after')) {
  db.exec(`ALTER TABLE custom_form_fields ADD COLUMN position_after TEXT NOT NULL DEFAULT ''`);
}

// ===== PAGE CONTENT CMS =====
// เก็บข้อความ (title, label, ปุ่ม ฯลฯ) ของหน้าต่างๆ ที่ Admin แก้ไขได้จากหลังบ้าน โดยไม่ต้องแก้ Source Code
// ออกแบบเป็น key-value ทั่วไป เพื่อให้เพิ่ม key ใหม่ในอนาคตได้ง่าย (เช่น dashboard.section.recent ในเฟสถัดไป)
db.exec(`
CREATE TABLE IF NOT EXISTS page_content (
  content_key    TEXT PRIMARY KEY,
  content_value  TEXT NOT NULL,
  updated_at     TEXT DEFAULT (datetime('now')),
  updated_by     INTEGER REFERENCES users(id)
);
`);
// seed ค่าเริ่มต้น = ข้อความเดิมที่เคย hard-code ไว้ในแต่ละหน้า (คงพฤติกรรมเดิมไว้ทั้งหมดจนกว่า Admin จะแก้เอง)
const PAGE_CONTENT_DEFAULTS = [
  ['dashboard.title', 'Dashboard'],
  ['my_requests.title', 'My Requests'],
  ['approve_requests.title', 'Approve Requests'],
  ['calendar.title', 'ปฏิทิน'],
  ['customers.title', 'Customer'],
  ['report.title', 'Report'],
  ['notifications.title', 'Notifications']
];
{
  const insertPageContentDefault = db.prepare('INSERT OR IGNORE INTO page_content (content_key, content_value) VALUES (?, ?)');
  const tx3 = db.transaction((rows) => { rows.forEach(([k, v]) => insertPageContentDefault.run(k, v)); });
  tx3(PAGE_CONTENT_DEFAULTS);
}

// ---------- ย้าย code จาก UNIQUE เดี่ยว (ทั้งระบบ) เป็น UNIQUE คู่กับ company ----------
// เหตุผล: รหัสลูกค้าจาก SAP ของแต่ละบริษัท (TAC/FAC/HTC) เป็นคนละชุดเลข อาจซ้ำกันได้ข้ามบริษัท
// SQLite แก้ constraint ของคอลัมน์ตรงๆ ไม่ได้ ถ้าฐานข้อมูลเก่ายังมี UNIQUE(code) แบบเดี่ยวติดมาจากตอนสร้างตารางครั้งแรก
// ต้องสร้างตารางใหม่แทนที่ (คง id เดิมทุกแถว เพื่อไม่ให้ visit_requests.customer_id ที่อ้างอิงอยู่พัง)
const oldSingleUniqueOnCode = db.prepare(`PRAGMA index_list(customers)`).all().find(idx => {
  if (idx.origin !== 'u') return false; // 'u' = index ที่เกิดจาก UNIQUE constraint ตอน CREATE TABLE
  const cols = db.prepare(`PRAGMA index_info(${idx.name})`).all();
  return cols.length === 1 && cols[0].name === 'code';
});

if (oldSingleUniqueOnCode) {
  db.pragma('foreign_keys = OFF'); // ต้องปิดนอก transaction เพราะ SQLite ไม่ยอมเปลี่ยนค่านี้ระหว่างมี transaction ค้างอยู่
  const rebuildCustomersTable = db.transaction(() => {
    db.exec(`
      CREATE TABLE customers_rebuild (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        code           TEXT NOT NULL,
        name           TEXT NOT NULL,
        contact_person TEXT,
        phone          TEXT,
        email          TEXT,
        address        TEXT,
        tax_id         TEXT,
        company        TEXT,
        is_archived    INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO customers_rebuild (id, code, name, contact_person, phone, email, address, tax_id, company, is_archived, created_at)
        SELECT id, code, name, contact_person, phone, email, address, tax_id, company, is_archived, created_at FROM customers;
      DROP TABLE customers;
      ALTER TABLE customers_rebuild RENAME TO customers;
    `);
  });
  rebuildCustomersTable();
  db.pragma('foreign_keys = ON');
}

// unique ร่วมของ (code, company) - รองรับทั้งฐานข้อมูลใหม่และเก่าที่เพิ่งย้ายมาด้านบน
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_code_company ON customers(code, company)`);

// ---------- leave_balances: migration (ON DELETE CASCADE + คอลัมน์โควตาลากิจ/ลาป่วย) ----------
// เหตุผล CASCADE: หน้า "จัดการสิทธิ์วันลา" จะสร้างแถว leave_balances ให้ทุก user โดยอัตโนมัติตอนเปิดหน้า (เพื่อความสะดวก)
// ถ้าตารางเดิมไม่มี ON DELETE CASCADE จะทำให้ลบ user ไม่ได้ทั้งที่ user คนนั้นไม่เคยมีคำขอลา/ข้อมูลอะไรเลย
// เหตุผลคอลัมน์ใหม่: เพิ่มสิทธิ์ตั้งต้นสำหรับลากิจ/ลาป่วย (เดิมมีแค่ลาพักร้อน)
{
  const lbCols = db.prepare(`PRAGMA table_info(leave_balances)`).all().map(c => c.name);
  const lbFks = db.prepare(`PRAGMA foreign_key_list(leave_balances)`).all();
  const hasCascade = lbFks.length > 0 && lbFks.some(fk => fk.on_delete === 'CASCADE');
  const hasNewCols = ['personal_total', 'personal_used', 'sick_total', 'sick_used'].every(c => lbCols.includes(c));

  if (!hasCascade || !hasNewCols) {
    db.pragma('foreign_keys = OFF'); // ต้องปิดนอก transaction เพราะ SQLite ไม่ยอมเปลี่ยนค่านี้ระหว่างมี transaction ค้างอยู่
    const rebuildLeaveBalances = db.transaction(() => {
      db.exec(`
        CREATE TABLE leave_balances_rebuild (
          user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          vacation_total   REAL NOT NULL DEFAULT 6,
          vacation_used    REAL NOT NULL DEFAULT 0,
          personal_total   REAL NOT NULL DEFAULT 3,
          personal_used    REAL NOT NULL DEFAULT 0,
          sick_total       REAL NOT NULL DEFAULT 30,
          sick_used        REAL NOT NULL DEFAULT 0,
          note             TEXT,
          updated_at       TEXT DEFAULT (datetime('now'))
        );
      `);
      const selectCols = [
        'user_id', 'vacation_total', 'vacation_used',
        lbCols.includes('personal_total') ? 'personal_total' : '3 AS personal_total',
        lbCols.includes('personal_used') ? 'personal_used' : '0 AS personal_used',
        lbCols.includes('sick_total') ? 'sick_total' : '30 AS sick_total',
        lbCols.includes('sick_used') ? 'sick_used' : '0 AS sick_used',
        'note', 'updated_at'
      ].join(', ');
      db.exec(`
        INSERT INTO leave_balances_rebuild (user_id, vacation_total, vacation_used, personal_total, personal_used, sick_total, sick_used, note, updated_at)
        SELECT ${selectCols} FROM leave_balances;
        DROP TABLE leave_balances;
        ALTER TABLE leave_balances_rebuild RENAME TO leave_balances;
      `);
    });
    rebuildLeaveBalances();
    db.pragma('foreign_keys = ON');
  }
}

// archived_at: วันเวลาที่ลูกค้ารายนี้ถูกเก็บถาวร ใช้คำนวณว่า "เก็บถาวรมานานแค่ไหนแล้ว" สำหรับกฎลบอัตโนมัติ
if (!db.prepare(`PRAGMA table_info(customers)`).all().map(c => c.name).includes('archived_at')) {
  db.exec(`ALTER TABLE customers ADD COLUMN archived_at TEXT`);
}

// ot_requests: เพิ่มช่องลูกค้า/โปรเจกต์ (ไม่บังคับ - ใช้เมื่อ OT เกี่ยวข้องกับลูกค้า เช่นแผนก Engineer)
{
  const otCols = db.prepare(`PRAGMA table_info(ot_requests)`).all().map(c => c.name);
  if (!otCols.includes('customer_id')) db.exec(`ALTER TABLE ot_requests ADD COLUMN customer_id INTEGER REFERENCES customers(id)`);
  if (!otCols.includes('project_no')) db.exec(`ALTER TABLE ot_requests ADD COLUMN project_no TEXT`);
  if (!otCols.includes('type_service')) db.exec(`ALTER TABLE ot_requests ADD COLUMN type_service TEXT`);
}

// ---------- Index เพิ่มความเร็วให้คอลัมน์ที่ค้นหา/join บ่อย ----------
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_visit_requests_requester ON visit_requests(requester_id);
  CREATE INDEX IF NOT EXISTS idx_visit_requests_customer ON visit_requests(customer_id);
  CREATE INDEX IF NOT EXISTS idx_visit_requests_approver ON visit_requests(approver_id);
  CREATE INDEX IF NOT EXISTS idx_visit_requests_status ON visit_requests(status);
  CREATE INDEX IF NOT EXISTS idx_visit_requests_visit_date ON visit_requests(visit_date);
  CREATE INDEX IF NOT EXISTS idx_approval_history_request ON approval_history(visit_request_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_approval_tokens_request ON approval_tokens(visit_request_id);
  CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company);
`);

// ---------- ตั้งค่าลบข้อมูลอัตโนมัติ (Data Retention) ----------
// data_type: system_logs | notifications | completed_visit_requests | archived_customers
// retain_unit: day | month | year - เก็บไว้กี่หน่วยก่อนลบ (คำนวณจากวันที่สร้าง/เก็บถาวร)
db.exec(`
  CREATE TABLE IF NOT EXISTS retention_settings (
    data_type        TEXT PRIMARY KEY,
    enabled          INTEGER NOT NULL DEFAULT 0,
    retain_value     INTEGER NOT NULL DEFAULT 12,
    retain_unit      TEXT NOT NULL DEFAULT 'month',
    last_run_at      TEXT,
    last_run_summary TEXT
  );
`);
const seedRetention = db.prepare(`
  INSERT OR IGNORE INTO retention_settings (data_type, enabled, retain_value, retain_unit) VALUES (?, 0, 12, 'month')
`);
['system_logs', 'notifications', 'completed_visit_requests', 'archived_customers'].forEach(t => seedRetention.run(t));

// ---------- ตั้งค่าอีเมล (Email Settings) ----------
// เพิ่มคอลัมน์ show_in_email ให้ core_field_settings (Field เดิมของระบบ) เพื่อให้เลือกได้ว่าจะโชว์ในอีเมลแจ้งอนุมัติหรือไม่
// เหมือนกับที่ custom_form_fields มีอยู่แล้ว แต่ก่อนหน้านี้ field เดิมยังไม่มีคอลัมน์นี้เลย
{
  const coreFieldColsForEmail = db.prepare(`PRAGMA table_info(core_field_settings)`).all().map(c => c.name);
  if (!coreFieldColsForEmail.includes('show_in_email')) {
    db.exec(`ALTER TABLE core_field_settings ADD COLUMN show_in_email INTEGER NOT NULL DEFAULT 0`);
  }
}

// Field พื้นฐานที่จำเป็นต่อระบบ (ลูกค้า/วันที่/เวลา/วัตถุประสงค์) ไม่อยู่ใน core_field_settings เพราะซ่อน/ถอด required ไม่ได้
// แต่ยังต้องเลือกได้ว่าจะโชว์ในอีเมลแจ้งอนุมัติหรือไม่ จึงแยกเก็บ flag นี้ไว้ต่างหาก
// default show_in_email = 1 ทุกตัว เพื่อคงพฤติกรรมเดิม (อีเมลเคย hardcode โชว์ 4 อย่างนี้เสมอ) จนกว่า Admin จะปรับเอง
db.exec(`
CREATE TABLE IF NOT EXISTS essential_field_email_settings (
  field_key     TEXT PRIMARY KEY,   -- customer_id | visit_date | time_range | purpose
  label         TEXT NOT NULL,
  show_in_email INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT DEFAULT (datetime('now')),
  updated_by    INTEGER REFERENCES users(id)
);
`);
const ESSENTIAL_EMAIL_DEFAULTS = [
  ['customer_id', 'ลูกค้า'],
  ['visit_date', 'วันที่'],
  ['time_range', 'เวลา (เริ่ม - สิ้นสุด)'],
  ['purpose', 'วัตถุประสงค์']
];
{
  const insertEssentialEmail = db.prepare('INSERT OR IGNORE INTO essential_field_email_settings (field_key, label, show_in_email, sort_order) VALUES (?, ?, 1, ?)');
  const tx4 = db.transaction((rows) => { rows.forEach(([k, l], idx) => insertEssentialEmail.run(k, l, idx)); });
  tx4(ESSENTIAL_EMAIL_DEFAULTS);
}

// ตั้งค่าทั่วไปแบบ key-value เผื่อใช้ในอนาคต (ตอนนี้ใช้เก็บว่าจะแสดงเลขที่เอกสาร #VR-code ในอีเมลหรือไม่)
// default = '1' (แสดง) เพื่อคงพฤติกรรมเดิมไว้ก่อน จนกว่า Admin จะเข้าไปปิดเองที่หน้าตั้งค่าอีเมล
db.exec(`
CREATE TABLE IF NOT EXISTS system_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`);
db.prepare(`INSERT OR IGNORE INTO system_settings (key, value) VALUES ('email_show_doc_code', '1')`).run();

// Field พื้นฐานที่จำเป็นต่อระบบ (วันที่ / รหัสลูกค้า / เวลาเริ่ม / เวลาสิ้นสุด / วัตถุประสงค์)
// ห้ามซ่อน/ห้ามถอด required (ผูกกับ logic หลักของระบบ) แต่ Admin ยังแก้ "ชื่อหัวข้อ (Label)" ที่แสดงในฟอร์มได้
// แยกเก็บเป็นตารางของตัวเอง (ไม่ปนกับ core_field_settings ที่มี is_visible/is_required/sort_order เพราะ 3 อย่างนั้นแก้ไม่ได้กับ field กลุ่มนี้)
db.exec(`
CREATE TABLE IF NOT EXISTS essential_field_labels (
  field_key  TEXT PRIMARY KEY,   -- visit_date | customer_id | time_from | time_to | purpose
  label      TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id)
);
`);
const ESSENTIAL_LABEL_DEFAULTS = [
  ['visit_date', 'วันที่'],
  ['customer_id', 'รหัสลูกค้า / บริษัท'],
  ['time_from', 'เวลาเริ่ม (แผน)'],
  ['time_to', 'เวลาสิ้นสุด (แผน)'],
  ['purpose', 'วัตถุประสงค์ / รายละเอียดงาน']
];
{
  const insertEssentialLabel = db.prepare('INSERT OR IGNORE INTO essential_field_labels (field_key, label) VALUES (?, ?)');
  ESSENTIAL_LABEL_DEFAULTS.forEach(([k, l]) => insertEssentialLabel.run(k, l));
}

// รายชื่อ "แผนก" ที่ใช้เป็นตัวเลือกแบบ dropdown ทั่วทั้งระบบ (แทนการพิมพ์เองแบบเดิม)
// ป้องกันปัญหาพิมพ์ไม่ตรงกัน เช่น "Sales" vs "Sales Engineer" ซึ่งทำให้การหาผู้อนุมัติ (เทียบ department แบบ exact match) พลาด
// Admin เพิ่ม/ลบแผนกเองได้ภายหลังที่หน้าจัดการผู้ใช้งาน โดยไม่ต้องแก้โค้ด (ดู routes/departments.js)
db.prepare(`INSERT OR IGNORE INTO system_settings (key, value) VALUES ('departments', ?)`)
  .run(JSON.stringify(['Sales', 'IT', 'Engineer', 'บัญชี/Accounting', 'HR', 'Stor']));

// การตั้งค่าหน้าตา PDF (Settings > ออกแบบ PDF) - Admin ปรับสี/โลโก้/หัวเอกสาร/ลำดับ-เปิดปิดหมวดได้เอง
// เก็บใน system_settings แบบ key-value เดียวกับค่าตั้งค่าอื่นๆ ของระบบ ไม่ต้องสร้างตารางใหม่
// pdf_logo_base64 เก็บเป็น data URL (base64) ตรงๆ - ใช้ pattern เดียวกับไฟล์แนบใน Form Builder (ดู server.js บรรทัด express.json limit 8mb)
// pdf_section_order / pdf_section_visible เก็บเป็น JSON string ของหมวดที่พิมพ์ใน PDF
const PDF_SETTINGS_DEFAULTS = {
  pdf_primary_color: '#0b1530',
  pdf_accent_color: '#2f5bff',
  pdf_logo_base64: '',
  pdf_org_name: 'TRISAK',
  pdf_org_subtitle: 'VISIT MANAGEMENT SYSTEM',
  pdf_doc_title: 'ใบขออนุมัติออกนอกสถานที่ (Visit Request Form)',
  pdf_show_signature: '1',
  pdf_section_order: JSON.stringify(['requester', 'customer', 'work', 'approval']),
  pdf_section_visible: JSON.stringify({ requester: true, customer: true, work: true, approval: true })
};
const insertPdfSetting = db.prepare(`INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)`);
Object.entries(PDF_SETTINGS_DEFAULTS).forEach(([k, v]) => insertPdfSetting.run(k, v));

module.exports = db;
