// db/seed.js
// สร้างข้อมูลตัวอย่าง (mock data) ให้ตรงกับภาพ Mockup ที่ผู้ใช้แนบมา
// รันด้วยคำสั่ง: npm run seed
const bcrypt = require('bcryptjs');
const db = require('./database');

function hash(pw) {
  return bcrypt.hashSync(pw, 10);
}

const wipe = db.transaction(() => {
  db.exec(`
    DELETE FROM notifications;
    DELETE FROM approval_history;
    DELETE FROM visit_requests;
    DELETE FROM customers;
    DELETE FROM users;
    DELETE FROM sqlite_sequence WHERE name IN ('notifications','approval_history','visit_requests','customers','users');
  `);
});
wipe();

const insertUser = db.prepare(`
  INSERT INTO users (username, password_hash, full_name, email, phone, position, department, role, avatar_url)
  VALUES (@username, @password_hash, @full_name, @email, @phone, @position, @department, @role, @avatar_url)
`);

const users = [
  {
    username: 'anuphong',
    password_hash: hash('123456'),
    full_name: 'Anuphong J.',
    email: 'anuphong.j@trisak.co.th',
    phone: '081-234-5678',
    position: 'Sales Engineer',
    department: 'Sales',
    role: 'Employee',
    avatar_url: '/img/avatar1.png'
  },
  {
    username: 'somchai',
    password_hash: hash('123456'),
    full_name: 'Somchai K.',
    email: 'somchai.k@trisak.co.th',
    phone: '081-345-6789',
    position: 'Sales Manager',
    department: 'Sales',
    role: 'Approver',
    avatar_url: '/img/avatar2.png'
  },
  {
    username: 'patcharin',
    password_hash: hash('123456'),
    full_name: 'Patcharin S.',
    email: 'patcharin@trisak.co.th',
    phone: '081-456-7890',
    position: 'Admin',
    department: 'IT',
    role: 'Admin',
    avatar_url: '/img/avatar3.png'
  },
  {
    username: 'worapong',
    password_hash: hash('123456'),
    full_name: 'Worapong T.',
    email: 'worapong.t@trisak.co.th',
    phone: '081-567-8901',
    position: 'Sales Manager',
    department: 'Sales',
    role: 'Approver',
    avatar_url: '/img/avatar2.png'
  }
];
const userIds = {};
for (const u of users) {
  const info = insertUser.run(u);
  userIds[u.username] = info.lastInsertRowid;
}

const insertCustomer = db.prepare(`
  INSERT INTO customers (code, name, contact_person, phone, email, address)
  VALUES (@code, @name, @contact_person, @phone, @email, @address)
`);
const customers = [
  { code: 'CUS-001', name: 'ABC Company Limited', contact_person: 'คุณสมศักดิ์', phone: '02-123-4567', email: 'contact@abc.co.th', address: '123 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ' },
  { code: 'CUS-002', name: 'DEF Co., Ltd.', contact_person: 'คุณวีระ', phone: '02-234-5678', email: 'contact@def.co.th', address: '45 ถนนพระราม 4 กรุงเทพฯ' },
  { code: 'CUS-003', name: 'GHI Corporation', contact_person: 'คุณปิยะวัฒน์', phone: '02-345-6789', email: 'contact@ghi.co.th', address: '78 ถนนรัชดาภิเษก กรุงเทพฯ' },
  { code: 'CUS-004', name: 'JKL Solutions', contact_person: 'คุณณัฐพร', phone: '02-456-7890', email: 'contact@jkl.co.th', address: '99 ถนนสีลม กรุงเทพฯ' },
  { code: 'CUS-005', name: 'MNO Group', contact_person: 'คุณกนกวรรณ', phone: '02-567-8901', email: 'contact@mno.co.th', address: '11 ถนนวิภาวดี กรุงเทพฯ' }
];
const customerIds = {};
for (const c of customers) {
  const info = insertCustomer.run(c);
  customerIds[c.name] = info.lastInsertRowid;
}

const insertVR = db.prepare(`
  INSERT INTO visit_requests
    (code, requester_id, customer_id, visit_date, time_from, time_to, purpose, location,
     contact_person, contact_phone, transport, license_plate, notes, status, approver_id, approved_at, approval_note, created_at,
     job_type, sales_person, mileage_out, mileage_in, actual_time_out, actual_time_back, ot_hours, product, participants, customer_tax_id, tax_invoice_date)
  VALUES
    (@code, @requester_id, @customer_id, @visit_date, @time_from, @time_to, @purpose, @location,
     @contact_person, @contact_phone, @transport, @license_plate, @notes, @status, @approver_id, @approved_at, @approval_note, @created_at,
     @job_type, @sales_person, @mileage_out, @mileage_in, @actual_time_out, @actual_time_back, @ot_hours, @product, @participants, @customer_tax_id, @tax_invoice_date)
`);
const insertHistory = db.prepare(`
  INSERT INTO approval_history (visit_request_id, action_by, action, note, created_at)
  VALUES (@visit_request_id, @action_by, @action, @note, @created_at)
`);

const visits = [
  { code: 'VR-2026-00121', customer: 'ABC Company Limited', date: '2026-08-15', from: '09:00', to: '16:00', purpose: 'เข้าพบลูกค้า เพื่อนำเสนอสินค้าและบริการ', status: 'pending' },
  { code: 'VR-2026-00120', customer: 'DEF Co., Ltd.', date: '2026-08-14', from: '09:00', to: '15:00', purpose: 'ติดตามงาน', status: 'approved' },
  { code: 'VR-2026-00119', customer: 'GHI Corporation', date: '2026-08-13', from: '10:00', to: '17:00', purpose: 'นำเสนอสินค้า', status: 'approved' },
  { code: 'VR-2026-00118', customer: 'JKL Solutions', date: '2026-08-12', from: '09:30', to: '16:30', purpose: 'เข้าพบลูกค้า', status: 'rejected' },
  { code: 'VR-2026-00117', customer: 'MNO Group', date: '2026-08-11', from: '09:00', to: '12:00', purpose: 'Service งาน', status: 'approved' },
  { code: 'VR-2026-00116', customer: 'ABC Company Limited', date: '2026-08-06', from: '09:00', to: '11:00', purpose: 'เข้าพบลูกค้า', status: 'approved' },
  { code: 'VR-2026-00115', customer: 'DEF Co., Ltd.', date: '2026-08-05', from: '13:00', to: '15:00', purpose: 'ติดตามงาน', status: 'approved' },
];

const jobTypes = ['เข้าพบลูกค้า', 'ติดตั้ง/บริการ', 'นำเสนอสินค้า', 'ติดตามงาน', 'ประชุมงาน'];
const products = ['เครื่องจักรอัตโนมัติ รุ่น FA-200', 'ชุดอะไหล่ Sensor', 'ระบบสายพานลำเลียง', 'ซอฟต์แวร์ควบคุมการผลิต', ''];

for (const [idx, v] of visits.entries()) {
  const requesterId = userIds['anuphong'];
  const approverId = userIds['somchai'];
  const isDone = v.status !== 'pending';
  const info = insertVR.run({
    code: v.code,
    requester_id: requesterId,
    customer_id: customerIds[v.customer],
    visit_date: v.date,
    time_from: v.from,
    time_to: v.to,
    purpose: v.purpose,
    location: '123 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ',
    contact_person: 'คุณสมชาย ใจดี',
    contact_phone: '081-234-5678',
    transport: 'รถยนต์ส่วนตัว',
    license_plate: 'กข 1234',
    notes: v.status === 'rejected' ? 'ลูกค้าขอเลื่อนนัดกะทันหัน' : '',
    status: v.status,
    approver_id: v.status === 'pending' ? null : approverId,
    approved_at: v.status === 'pending' ? null : v.date + ' 11:05:00',
    approval_note: v.status === 'approved' ? 'อนุมัติให้เข้าพบลูกค้าได้รับ' : (v.status === 'rejected' ? 'ขอเลื่อนวัน Visit เนื่องจากมีประชุมภายใน' : null),
    created_at: v.date + ' 10:32:00',
    job_type: jobTypes[idx % jobTypes.length],
    sales_person: 'Anuphong J.',
    mileage_out: isDone ? 12450 + idx * 35 : null,
    mileage_in: isDone ? 12450 + idx * 35 + 42 : null,
    actual_time_out: isDone ? v.from : '',
    actual_time_back: isDone ? v.to : '',
    ot_hours: isDone && idx % 3 === 0 ? 1.5 : null,
    product: products[idx % products.length],
    participants: idx % 2 === 0 ? 'Somchai K. (Sales Manager)' : '',
    customer_tax_id: '0-1055-' + (54000 + idx * 7),
    tax_invoice_date: isDone ? v.date : ''
  });
  insertHistory.run({ visit_request_id: info.lastInsertRowid, action_by: requesterId, action: 'ส่งคำขอ', note: null, created_at: v.date + ' 10:32:00' });
  if (v.status !== 'pending') {
    insertHistory.run({
      visit_request_id: info.lastInsertRowid,
      action_by: approverId,
      action: v.status === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ',
      note: v.status === 'approved' ? 'อนุมัติให้เข้าพบลูกค้าได้รับ' : 'ขอเลื่อนวัน Visit เนื่องจากมีประชุมภายใน',
      created_at: v.date + ' 11:05:00'
    });
  }
}

const insertNotif = db.prepare(`
  INSERT INTO notifications (user_id, type, message, related_id, is_read, created_at)
  VALUES (@user_id, @type, @message, @related_id, @is_read, @created_at)
`);
insertNotif.run({ user_id: userIds['somchai'], type: 'new_request', message: 'มีคำขอออกนอกสถานที่ใหม่จาก Anuphong J. วันที่ 15/08/2026 เวลา 09:00 - 16:00', related_id: 1, is_read: 0, created_at: '2026-08-15 10:32:00' });
insertNotif.run({ user_id: userIds['anuphong'], type: 'approved', message: 'คำขอออกนอกสถานที่วันที่ 14/08/2026 ได้รับการอนุมัติ', related_id: 2, is_read: 0, created_at: '2026-08-14 09:45:00' });
insertNotif.run({ user_id: userIds['anuphong'], type: 'rejected', message: 'คำขอออกนอกสถานที่วันที่ 12/08/2026 ไม่ได้รับการอนุมัติ', related_id: 4, is_read: 1, created_at: '2026-08-12 08:30:00' });

console.log('✅ Seed ข้อมูลสำเร็จ');
console.log('----- บัญชีผู้ใช้สำหรับทดสอบ (รหัสผ่านทั้งหมด: 123456) -----');
console.log('พนักงาน (Employee) : username = anuphong');
console.log('ผู้อนุมัติ (Approver): username = somchai');
console.log('ผู้ดูแลระบบ (Admin) : username = patcharin');
