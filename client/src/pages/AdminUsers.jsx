// client/src/pages/AdminUsers.jsx - เทียบเท่า public/admin-users.html
import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api, ROLE_TH } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const emptyForm = { username: '', password: '', full_name: '', email: '', phone: '', position: '', departments: [], role: 'Employee' };

export default function AdminUsers() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [editing, setEditing] = useState(undefined);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    const [{ users }, { departments }] = await Promise.all([
      api.get('/api/users'),
      api.get('/api/departments')
    ]);
    setUsers(users);
    setDepartments(departments);
  };

  const addDepartment = async () => {
    const name = (prompt('ชื่อแผนกใหม่:') || '').trim();
    if (!name) return;
    try {
      const { departments } = await api.post('/api/departments', { name });
      setDepartments(departments);
      setForm(f => ({ ...f, departments: f.departments.includes(name) ? f.departments : [...f.departments, name] }));
      toast('เพิ่มแผนกสำเร็จ', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  useEffect(() => { load(); }, []);

  const openForm = (u) => {
    setEditing(u || null);
    setForm(u
      ? {
        username: u.username, password: '', full_name: u.full_name, email: u.email || '', phone: u.phone || '',
        position: u.position || '', departments: Array.isArray(u.departments) && u.departments.length ? u.departments : (u.department ? [u.department] : []),
        role: u.role
      }
      : emptyForm);
  };

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const toggleDept = (d) => (e) => {
    setForm(f => ({
      ...f,
      departments: e.target.checked ? [...f.departments, d] : f.departments.filter(x => x !== d)
    }));
  };

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

  // แผนกของ user คนหนึ่ง (รองรับทั้งของเก่า department เดี่ยว และของใหม่ departments หลายแผนก)
  const deptOf = (u) => (Array.isArray(u.departments) && u.departments.length) ? u.departments : (u.department ? [u.department] : []);
  const CARD_COLORS = ['blue', 'green', 'orange', 'purple', 'teal', 'pink', 'indigo', 'slate', 'cyan', 'red'];
  const deptCounts = departments.map((d, i) => ({ name: d, count: users.filter(u => deptOf(u).includes(d)).length, color: CARD_COLORS[i % CARD_COLORS.length] }));
  const unassignedCount = users.filter(u => deptOf(u).length === 0).length;

  return (
    <Layout title="จัดการผู้ใช้งาน (User Management)">
      <div className="flex between mb-16">
        <h3 style={{ margin: 0 }}>รายชื่อผู้ใช้งานทั้งหมด</h3>
        <button className="btn btn-primary" onClick={() => openForm(null)}>+ เพิ่มผู้ใช้</button>
      </div>

      {/* สรุปจำนวนพนักงานรวม และแยกตามแผนก */}
      <div className="stat-card blue mb-16" style={{ maxWidth: 320 }}>
        <div className="label">พนักงานทั้งหมดในระบบ</div>
        <div className="value">{users.length}<span className="unit">คน</span></div>
      </div>
      <div className="dept-grid">
        {deptCounts.map(d => (
          <div className={`stat-card sm ${d.color}`} key={d.name}>
            <div className="label">{d.name}</div>
            <div className="value">{d.count}<span className="unit">คน</span></div>
          </div>
        ))}
        {unassignedCount > 0 && (
          <div className="stat-card sm slate">
            <div className="label">ไม่ระบุแผนก</div>
            <div className="value">{unassignedCount}<span className="unit">คน</span></div>
          </div>
        )}
      </div>

      {(() => {
        // จัดกลุ่มผู้ใช้ตามแผนก (คนที่ดูแลหลายแผนกจะโผล่ในทุกโซนที่เกี่ยวข้อง)
        const zones = departments.map(d => ({ name: d, users: users.filter(u => deptOf(u).includes(d)) }));
        const unassigned = users.filter(u => deptOf(u).length === 0);
        if (unassigned.length) zones.push({ name: 'ไม่ระบุแผนก', users: unassigned });

        const renderTable = (list) => (
          <table>
            <thead><tr><th>ชื่อ-นามสกุล</th><th>Username</th><th>อีเมล</th><th>ตำแหน่ง</th><th>แผนก</th><th>สิทธิ์การใช้งาน</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>
              {list.map(u => (
                <tr key={u.id}>
                  <td>{u.full_name}</td>
                  <td>{u.username}</td>
                  <td>{u.email || '-'}</td>
                  <td>{u.position || '-'}</td>
                  <td>{deptOf(u).length ? deptOf(u).join(', ') : '-'}</td>
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
        );

        return zones.map(z => (
          <div className="card mb-16" key={z.name}>
            <div className="card-body" style={{ padding: 0 }}>
              <div style={{ padding: '12px 16px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                รายชื่อแผนก {z.name} <span className="muted" style={{ fontWeight: 400 }}>({z.users.length} คน)</span>
              </div>
              {z.users.length ? renderTable(z.users) : (
                <div className="muted" style={{ padding: '12px 16px', fontSize: 12.5 }}>ยังไม่มีผู้ใช้ในแผนกนี้</div>
              )}
            </div>
          </div>
        ));
      })()}

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
                <div className="form-group">
                  <label>แผนก {form.role === 'Approver' && <span className="muted" style={{ fontWeight: 400 }}>(เลือกได้หลายแผนก ถ้าดูแลมากกว่า 1 แผนก)</span>}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', maxHeight: 180, overflowY: 'auto' }}>
                    {departments.length ? departments.map(d => (
                      <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={form.departments.includes(d)} onChange={toggleDept(d)} /> {d}
                      </label>
                    )) : <span className="muted" style={{ fontSize: 12.5 }}>ยังไม่มีรายชื่อแผนก</span>}
                    {/* ถ้าค่าเดิมของ user มีแผนกที่ไม่ตรงกับลิสต์ปัจจุบัน (เช่น พิมพ์ผิดมาจากรอบก่อน) ให้โชว์ไว้ด้วยเพื่อให้เห็นและแก้ไขได้ */}
                    {form.departments.filter(d => !departments.includes(d)).map(d => (
                      <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, color: '#c0392b' }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked onChange={toggleDept(d)} /> {d} (ไม่ตรงรายการ - โปรดแก้ไข)
                      </label>
                    ))}
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 6 }} onClick={addDepartment}>
                    + เพิ่มแผนกใหม่
                  </button>
                </div>
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
