// client/src/pages/AdminPageContent.jsx - Admin CMS: แก้ไขข้อความ (Page Title ฯลฯ) ของแต่ละหน้า
import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { usePageContent } from '../lib/PageContentContext';

// รายชื่อหน้าที่จัดการได้ตอนนี้ (ต่อยอดเพิ่ม key อื่นๆ ในอนาคตได้ เช่น label ในตาราง, ข้อความปุ่ม)
const PAGES = [
  { key: 'dashboard.title', page: 'Dashboard', field: 'Page Title' },
  { key: 'my_requests.title', page: 'My Requests', field: 'Page Title' },
  { key: 'approve_requests.title', page: 'Approve Requests', field: 'Page Title' },
  { key: 'calendar.title', page: 'ปฏิทิน (Calendar)', field: 'Page Title' },
  { key: 'customers.title', page: 'Customer', field: 'Page Title' },
  { key: 'report.title', page: 'Report', field: 'Page Title' },
  { key: 'notifications.title', page: 'Notifications', field: 'Page Title' }
];

export default function AdminPageContent() {
  const toast = useToast();
  const { pc, reload } = usePageContent();
  const [editingKey, setEditingKey] = useState(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { reload(); }, []); // เข้าหน้านี้ทีไร โหลดค่าล่าสุดเสมอ เผื่อมีการแก้จากที่อื่น

  const openEdit = (item) => {
    setEditingKey(item.key);
    setValue(pc(item.key, ''));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/api/page-content/${editingKey}`, { value });
      toast('บันทึกสำเร็จ', 'success');
      setEditingKey(null);
      reload(); // อัปเดตทันทีทุกหน้าที่ใช้ context นี้อยู่ (เช่น sidebar badge, หน้าอื่นที่เปิดค้างไว้)
    } catch (err) { toast(err.message, 'error'); }
    setSaving(false);
  };

  return (
    <Layout title="จัดการหน้า/หัวข้อของระบบ">
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
        แก้ไขข้อความที่แสดงในหน้าต่างๆ ของระบบได้จากตรงนี้ โดยไม่ต้องแก้ Source Code — มีผลทันทีที่บันทึก
      </p>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>หน้า</th><th>ส่วนที่แก้ได้</th><th>ข้อความปัจจุบัน</th><th>จัดการ</th></tr>
            </thead>
            <tbody>
              {PAGES.map(item => (
                <tr key={item.key}>
                  <td><b>{item.page}</b></td>
                  <td className="muted">{item.field}</td>
                  <td>{pc(item.key, '-')}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => openEdit(item)}>แก้ไข</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingKey && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setEditingKey(null); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>แก้ไขข้อความ</h3>
              <button className="modal-close" onClick={() => setEditingKey(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={submit}>
                <div className="form-group">
                  <label>ข้อความ</label>
                  <input value={value} onChange={e => setValue(e.target.value)} required autoFocus />
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setEditingKey(null)}>ยกเลิก</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>บันทึก</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
