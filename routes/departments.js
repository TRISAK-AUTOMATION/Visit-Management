// routes/departments.js - รายชื่อ "แผนก" ที่ใช้เป็นตัวเลือก (dropdown) แทนการพิมพ์เอง
// ทุกคนที่ล็อกอินแล้วอ่านลิสต์ได้ (ใช้เติม dropdown ที่หน้าโปรไฟล์ตัวเองด้วย ไม่ใช่แค่หน้า Admin)
// แต่เพิ่ม/ลบแผนกได้เฉพาะ Admin เท่านั้น
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { getDepartments, saveDepartments } = require('../utils/departments');
const { logAction } = require('../utils/systemLog');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.json({ departments: getDepartments() });
});

// เพิ่มแผนกใหม่ - Admin เท่านั้น
router.post('/', requireAuth, requireRole('Admin'), (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อแผนก' });

  const list = getDepartments();
  if (list.some(d => d.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: 'มีแผนกนี้อยู่แล้ว' });
  }
  const updated = [...list, name];
  saveDepartments(updated);
  logAction(req.session.userId, 'add_department', `เพิ่มแผนกใหม่: ${name}`);
  res.status(201).json({ departments: updated });
});

// ลบแผนก - Admin เท่านั้น (กันลบถ้ายังมีผู้ใช้อยู่แผนกนั้น เพื่อไม่ให้ข้อมูลเก่ากำพร้า)
router.delete('/:name', requireAuth, requireRole('Admin'), (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const inUse = db.prepare('SELECT COUNT(*) AS c FROM users WHERE department = ?').get(name);
  if (inUse.c > 0) {
    return res.status(400).json({
      error: `ไม่สามารถลบแผนก "${name}" ได้ เนื่องจากยังมีผู้ใช้งาน ${inUse.c} คนอยู่แผนกนี้ กรุณาย้ายผู้ใช้ออกจากแผนกนี้ก่อน`
    });
  }
  const list = getDepartments();
  const updated = list.filter(d => d !== name);
  if (updated.length === list.length) return res.status(404).json({ error: 'ไม่พบแผนกนี้' });

  saveDepartments(updated);
  logAction(req.session.userId, 'delete_department', `ลบแผนก: ${name}`);
  res.json({ departments: updated });
});

module.exports = router;
