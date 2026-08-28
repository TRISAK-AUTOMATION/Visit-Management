// db/importCustomers.js
// นำเข้าข้อมูลลูกค้า/บริษัทจากไฟล์ CSV (customers_import.csv) เข้าตาราง customers
// วิธีรัน:  node db/importCustomers.js
//
// รูปแบบไฟล์ CSV ที่ต้องการ (แถวแรกเป็นหัวคอลัมน์):
// code,name,contact_person,address,tax_id,payment_terms
//
// - ถ้ารหัสลูกค้า (code) ซ้ำกับที่มีอยู่แล้ว จะ "อัปเดต" ข้อมูลแถวเดิมแทนการสร้างซ้ำ
// - ถ้าในไฟล์ CSV เองมี code ซ้ำกันหลายแถว จะใช้แถวแรกที่เจอ แถวถัดไปที่ code ซ้ำจะถูกข้าม

const fs = require('fs');
const path = require('path');
const db = require('./database');

const CSV_PATH = path.join(__dirname, 'customers_import.csv');

function parseCsv(text) {
  // ตัด BOM ออกถ้ามี (Excel มักแนบ BOM มาด้วยตอน export utf-8-sig)
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* ignore */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

function run() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`ไม่พบไฟล์ ${CSV_PATH}`);
    console.error('วาง customers_import.csv ไว้ในโฟลเดอร์ db/ ก่อนรันสคริปต์นี้');
    process.exit(1);
  }

  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(raw);
  const header = rows.shift().map(h => h.trim());

  const col = (name) => header.indexOf(name);
  const idx = {
    code: col('code'),
    name: col('name'),
    contact_person: col('contact_person'),
    address: col('address'),
    tax_id: col('tax_id')
  };

  if (idx.code === -1 || idx.name === -1) {
    console.error('ไฟล์ CSV ต้องมีคอลัมน์ code และ name อย่างน้อย');
    process.exit(1);
  }

  const upsert = db.prepare(`
    INSERT INTO customers (code, name, contact_person, address, tax_id)
    VALUES (@code, @name, @contact_person, @address, @tax_id)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      contact_person = excluded.contact_person,
      address = excluded.address,
      tax_id = excluded.tax_id
  `);

  const seenCodes = new Set();
  let inserted = 0, updated = 0, skippedNoCode = 0, skippedDupInFile = 0;

  const runAll = db.transaction((records) => {
    for (const r of records) {
      const code = (r[idx.code] || '').trim();
      const name = (r[idx.name] || '').trim();
      if (!code || !name) { skippedNoCode++; continue; }
      if (seenCodes.has(code)) { skippedDupInFile++; continue; }
      seenCodes.add(code);

      const existing = db.prepare('SELECT id FROM customers WHERE code = ?').get(code);
      upsert.run({
        code,
        name,
        contact_person: idx.contact_person !== -1 ? (r[idx.contact_person] || '').trim() : '',
        address: idx.address !== -1 ? (r[idx.address] || '').trim() : '',
        tax_id: idx.tax_id !== -1 ? (r[idx.tax_id] || '').trim() : ''
      });
      if (existing) updated++; else inserted++;
    }
  });

  runAll(rows);

  console.log('นำเข้าข้อมูลลูกค้าเสร็จสิ้น');
  console.log(`  เพิ่มใหม่:        ${inserted}`);
  console.log(`  อัปเดตข้อมูลเดิม: ${updated}`);
  console.log(`  ข้าม (ไม่มี code/name): ${skippedNoCode}`);
  console.log(`  ข้าม (code ซ้ำในไฟล์):   ${skippedDupInFile}`);
}

run();
