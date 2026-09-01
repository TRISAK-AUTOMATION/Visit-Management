// client/src/pages/AdminUsers.jsx - เทียบเท่า public/admin-users.html
import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api, ROLE_TH } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const emptyForm = { username: '', password: '', full_name: '', email: '', phone: '', position: '', department: '', role: 'Employee' };

export default function AdminUsers() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(undefined);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    const { users } = await api.get('/api/users');
    setUsers(users);
  };

  useEffect(() => { load(); }, []);

  const openForm = (u) => {
    setEditing(u || null);
    setForm(u
      ? { username: u.username, password: '', full_name: u.full_name, email: u.email || '', phone: u.phone || '', position: u.position || '', department: u.department || '', role: u.role }
      : emptyForm);
  };

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/api/users/${editing.id}`, form);
      } else {
        await api.post('/api/users', form);
      }
      toast('บันทึกสำเร็จ', 'success');
      setEditing(undefined);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const remove = async (id) => {
    if (!confirm('ยืนยันลบผู้ใช้รายนี้หรือไม่?')) return;
    try {
      await api.del(`/api/users/${id}`);
      toast('ลบสำเร็จ', 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const toggleActive = async (u) => {
    const willActivate = !u.is_active;
    if (!confirm(willActivate ? `ยืนยันเปิดใช้งานบัญชีของ ${u.full_name}?` : `ยืนยันระงับการใช้งานบัญชีของ ${u.full_name}?`)) return;
    try {
      await api.patch(`/api/users/${u.id}/active`, { is_active: willActivate });
      toast(willActivate ? 'เปิดใช้งานบัญชีสำเร็จ' : 'ระงับการใช้งานบัญชีสำเร็จ', 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <Layout title="จัดการผู้ใช้งาน (User Management)">
      <div className="flex between mb-16">
        <h3 style={{ margin: 0 }}>รายชื่อผู้ใช้งานทั้งหมด</h3>
        <button className="btn btn-primary" onClick={() => openForm(null)}>+ เพิ่มผู้ใช้</button>
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>ชื่อ-นามสกุล</th><th>Username</th><th>อีเมล</th><th>ตำแหน่ง</th><th>สิทธิ์การใช้งาน</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.full_name}</td>
                  <td>{u.username}</td>
                  <td>{u.email || '-'}</td>
                  <td>{u.position || '-'}</td>
                  <td><span className={`badge ${u.role === 'Admin' ? 'rejected' : u.role === 'Approver' ? 'approved' : 'pending'}`}>{ROLE_TH[u.role]}</span></td>
                  <td><span className={`badge ${u.is_active ? 'approved' : 'cancelled'}`}>{u.is_active ? 'ใช้งานอยู่' : 'ถูกระงับ'}</span></td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => openForm(u)}>แก้ไข</button>{' '}
                    <button className="btn btn-outline btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? 'ระงับใช้งาน' : 'เปิดใช้งาน'}</button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => remove(u.id)}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setEditing(undefined); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>{editing ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}</h3>
              <button className="modal-close" onClick={() => setEditing(undefined)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSubmit}>
                {!editing && (
                  <>
                    <div className="form-group"><label>Username <span className="req">*</span></label><input value={form.username} onChange={set('username')} required /></div>
                    <div className="form-group"><label>รหัสผ่าน <span className="req">*</span></label><input type="password" value={form.password} onChange={set('password')} required /></div>
                  </>
                )}
                <div className="form-group"><label>ชื่อ-นามสกุล <span className="req">*</span></label><input value={form.full_name} onChange={set('full_name')} required /></div>
                <div className="form-group"><label>อีเมล</label><input value={form.email} onChange={set('email')} /></div>
                <div className="form-group"><label>เบอร์โทร</label><input value={form.phone} onChange={set('phone')} /></div>
                <div className="form-group"><label>ตำแหน่ง</label><input value={form.position} onChange={set('position')} /></div>
                <div className="form-group"><label>แผนก</label><input value={form.department} onChange={set('department')} /></div>
                <div className="form-group">
                  <label>สิทธิ์การใช้งาน</label>
                  <select value={form.role} onChange={set('role')}>
                    <option value="Employee">พนักงาน (Employee)</option>
                    <option value="Approver">ผู้อนุมัติ (Approver)</option>
                    <option value="Admin">ผู้ดูแลระบบ (Admin)</option>
                  </select>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setEditing(undefined)}>ยกเลิก</button>
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
