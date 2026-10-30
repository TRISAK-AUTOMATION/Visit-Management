// client/src/pages/AdminProfilePermissions.jsx - Admin มอบสิทธิ์แก้ไขโปรไฟล์/คะแนนคนอื่นเป็นพิเศษ
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { api, fmtDateTime } from '../lib/api';
import { useToast } from '../lib/ToastContext';

export default function AdminProfilePermissions() {
  const toast = useToast();
  const [permissions, setPermissions] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ editor_user_id: '', target_user_id: '' });

  const load = async () => {
    const { permissions } = await api.get('/api/kpi/permissions/all');
    setPermissions(permissions);
  };
  useEffect(() => {
    load();
    api.get('/api/users').then(({ users }) => setUsers(users)).catch(() => {});
  }, []);

  const grant = async (e) => {
    e.preventDefault();
    if (!form.editor_user_id || !form.target_user_id) { toast('กรุณาเลือกทั้งสองคน', 'error'); return; }
    try {
      await api.post('/api/kpi/permissions', form);
      toast('มอบสิทธิ์สำเร็จ', 'success');
      setForm({ editor_user_id: '', target_user_id: '' });
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const revoke = async (id) => {
    if (!confirm('ยืนยันถอนสิทธิ์นี้หรือไม่?')) return;
    try { await api.del(`/api/kpi/permissions/${id}`); toast('ถอนสิทธิ์สำเร็จ', 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <Layout title="มอบสิทธิ์ผู้ประเมิน (Profile Edit Permissions)">
      <div className="card mb-16">
        <div className="card-head"><h3>มอบสิทธิ์เพิ่มเติม</h3></div>
        <div className="card-body">
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            ตามค่าเริ่มต้น หัวหน้า (ผู้อนุมัติ) แก้ไขคะแนน/โปรไฟล์ได้เฉพาะคนในแผนกเดียวกันเท่านั้น
            ใช้หน้านี้เพื่อมอบสิทธิ์เพิ่มเติมให้ใครสักคน แก้ไขข้อมูลของอีกคนได้ ไม่ว่าจะอยู่แผนกไหนก็ตาม (เช่น ให้ HR แก้ไขได้ทุกคน)
          </div>
          <form onSubmit={grant} className="form-grid">
            <div className="form-group">
              <label>ผู้ที่จะได้รับสิทธิ์แก้ไข</label>
              <select value={form.editor_user_id} onChange={e => setForm(f => ({ ...f, editor_user_id: e.target.value }))} required>
                <option value="">-- เลือก --</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.username})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>ให้แก้ไขข้อมูลของ</label>
              <select value={form.target_user_id} onChange={e => setForm(f => ({ ...f, target_user_id: e.target.value }))} required>
                <option value="">-- เลือก --</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.username})</option>)}
              </select>
            </div>
            <div className="form-group full">
              <button type="submit" className="btn btn-primary">มอบสิทธิ์</button>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>สิทธิ์ที่มอบไว้ทั้งหมด</h3></div>
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>ผู้ได้รับสิทธิ์</th><th>แก้ไขข้อมูลของ</th><th>วันที่มอบ</th><th>จัดการ</th></tr></thead>
            <tbody>
              {permissions.length ? permissions.map(p => (
                <tr key={p.id}>
                  <td>{p.editor_name}</td>
                  <td>{p.target_name}</td>
                  <td>{fmtDateTime(p.created_at)}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => revoke(p.id)}>ถอนสิทธิ์</button></td>
                </tr>
              )) : <tr><td colSpan={4} className="empty">ยังไม่มีการมอบสิทธิ์พิเศษ</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
