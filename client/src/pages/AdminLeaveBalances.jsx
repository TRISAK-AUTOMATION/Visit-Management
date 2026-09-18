// client/src/pages/AdminLeaveBalances.jsx - Admin จัดการสิทธิ์วันลารายบุคคล
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';

export default function AdminLeaveBalances() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    vacation_total: 6, vacation_used: 0,
    personal_total: 3, personal_used: 0,
    sick_total: 30, sick_used: 0,
    note: ''
  });
  const [q, setQ] = useState('');

  const load = async () => {
    const { balances } = await api.get('/api/leave-requests/balances/all');
    setRows(balances);
  };
  useEffect(() => { load(); }, []);

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      vacation_total: row.balance.vacation_total, vacation_used: row.balance.vacation_used,
      personal_total: row.balance.personal_total, personal_used: row.balance.personal_used,
      sick_total: row.balance.sick_total, sick_used: row.balance.sick_used,
      note: row.balance.note || ''
    });
  };

  const setNum = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/api/leave-requests/balances/${editing.id}`, form);
      toast('บันทึกสิทธิ์วันลาสำเร็จ', 'success');
      setEditing(null);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const filtered = rows.filter(r => !q.trim() || r.full_name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Layout title="จัดการสิทธิ์วันลา (Leave Balances)">
      <div className="flex between mb-16" style={{ flexWrap: 'wrap', gap: 10 }}>
        <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาพนักงาน..."
          style={{ width: 240, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9 }} />
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>ชื่อ-นามสกุล</th>
                <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>แผนก</th>
                <th colSpan={3} style={{ textAlign: 'center' }}>ลาพักร้อน (วัน)</th>
                <th colSpan={3} style={{ textAlign: 'center' }}>ลากิจ (วัน)</th>
                <th colSpan={3} style={{ textAlign: 'center' }}>ลาป่วย (วัน)</th>
                <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>จัดการ</th>
              </tr>
              <tr>
                <th>สิทธิ์</th><th>ใช้ไป</th><th>คงเหลือ</th>
                <th>สิทธิ์</th><th>ใช้ไป</th><th>คงเหลือ</th>
                <th>สิทธิ์</th><th>ใช้ไป</th><th>คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td>{r.full_name}</td>
                  <td>{r.department || '-'}</td>
                  <td>{r.balance.vacation_total}</td>
                  <td>{r.balance.vacation_used}</td>
                  <td>{Math.max(0, r.balance.vacation_total - r.balance.vacation_used)}</td>
                  <td>{r.balance.personal_total}</td>
                  <td>{r.balance.personal_used}</td>
                  <td>{Math.max(0, r.balance.personal_total - r.balance.personal_used)}</td>
                  <td>{r.balance.sick_total}</td>
                  <td>{r.balance.sick_used}</td>
                  <td>{Math.max(0, r.balance.sick_total - r.balance.sick_used)}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => openEdit(r)}>แก้ไขสิทธิ์</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="modal">
            <div className="modal-head"><h3>แก้ไขสิทธิ์วันลา - {editing.full_name}</h3><button className="modal-close" onClick={() => setEditing(null)}>×</button></div>
            <div className="modal-body">
              <form onSubmit={save}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>สิทธิ์ลาพักร้อนต่อปี (วัน)</label>
                    <input type="number" step="0.5" value={form.vacation_total} onChange={setNum('vacation_total')} required />
                  </div>
                  <div className="form-group">
                    <label>ลาพักร้อนที่ใช้ไปแล้ว (วัน)</label>
                    <input type="number" step="0.5" value={form.vacation_used} onChange={setNum('vacation_used')} required />
                  </div>
                  <div className="form-group">
                    <label>สิทธิ์ลากิจต่อปี (วัน)</label>
                    <input type="number" step="0.5" value={form.personal_total} onChange={setNum('personal_total')} required />
                  </div>
                  <div className="form-group">
                    <label>ลากิจที่ใช้ไปแล้ว (วัน)</label>
                    <input type="number" step="0.5" value={form.personal_used} onChange={setNum('personal_used')} required />
                  </div>
                  <div className="form-group">
                    <label>สิทธิ์ลาป่วยต่อปี (วัน)</label>
                    <input type="number" step="0.5" value={form.sick_total} onChange={setNum('sick_total')} required />
                  </div>
                  <div className="form-group">
                    <label>ลาป่วยที่ใช้ไปแล้ว (วัน)</label>
                    <input type="number" step="0.5" value={form.sick_used} onChange={setNum('sick_used')} required />
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 11.5, margin: '2px 0 10px' }}>
                  ค่าเริ่มต้น: ลาพักร้อน 6 วัน, ลากิจ 3 วัน (ตามนโยบายบริษัท ไม่มีขั้นต่ำตามกฎหมาย), ลาป่วยแบบได้ค่าจ้าง 30 วัน (สูงสุดตามกฎหมายแรงงาน) — ปรับได้ตามจริงของแต่ละคน
                  ระบบจะหักยอด "ใช้ไป" ให้อัตโนมัติเมื่อคำขอลาประเภทนั้นถูกอนุมัติ ปรับเองที่นี่ได้ในกรณีพิเศษ เช่น ยกยอดจากระบบเก่า
                </div>
                <div className="form-group">
                  <label>หมายเหตุ</label>
                  <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="เช่น เริ่มงานกลางปี ปรับสิทธิ์ตามสัดส่วน" />
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>ยกเลิก</button>
                  <button type="submit" className="btn btn-primary">บันทึก</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
