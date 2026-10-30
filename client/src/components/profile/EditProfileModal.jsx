// ฟอร์มแก้ไขโปรไฟล์ — ใช้ endpoint/validation เดิม PUT /api/users/me
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { api, initials } from '../../lib/api';
import { useToast } from '../../lib/ToastContext';

export default function EditProfileModal({ me, setMe, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    full_name: me.full_name, email: me.email || '', phone: me.phone || '',
    position: me.position || '', department: me.department || '',
    email_notify: !!me.email_notify, avatar_url: me.avatar_url || ''
  });
  const [departments, setDepartments] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (f) => (e) => setForm(v => ({ ...v, [f]: e.target.value }));

  useEffect(() => { api.get('/api/departments').then(r => setDepartments(r.departments || [])).catch(() => {}); }, []);

  const pickAvatar = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('กรุณาเลือกไฟล์รูปภาพเท่านั้น', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { toast('ไฟล์รูปต้องมีขนาดไม่เกิน 2MB', 'error'); return; }
    const r = new FileReader();
    r.onload = () => setForm(v => ({ ...v, avatar_url: r.result }));
    r.readAsDataURL(file);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/api/users/me', form);
      setMe(m => ({ ...m, ...form }));
      toast('บันทึกข้อมูลสำเร็จ', 'success');
      onSaved && onSaved();
      onClose();
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="แก้ไขโปรไฟล์" onClose={onClose} labelId="pd-edit-title">
      <form onSubmit={save}>
        <div className="flex gap-12 mb-16" style={{ alignItems: 'center' }}>
          {form.avatar_url
            ? <img src={form.avatar_url} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />
            : <div className="pill-avatar" style={{ width: 56, height: 56, fontSize: 18 }}>{initials(form.full_name)}</div>}
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            เปลี่ยนรูป<input type="file" accept="image/*" onChange={pickAvatar} style={{ display: 'none' }} />
          </label>
        </div>
        <div className="form-group"><label htmlFor="pe-name">ชื่อ-นามสกุล</label><input id="pe-name" value={form.full_name} onChange={set('full_name')} required /></div>
        <div className="form-group"><label htmlFor="pe-mail">อีเมล</label><input id="pe-mail" value={form.email} onChange={set('email')} /></div>
        <div className="form-group"><label htmlFor="pe-phone">เบอร์โทร</label><input id="pe-phone" value={form.phone} onChange={set('phone')} /></div>
        <div className="form-group"><label htmlFor="pe-pos">ตำแหน่ง</label><input id="pe-pos" value={form.position} onChange={set('position')} /></div>
        <div className="form-group">
          <label htmlFor="pe-dep">แผนก</label>
          <select id="pe-dep" value={form.department} onChange={set('department')} disabled={me.role !== 'Admin'}>
            <option value="">-- เลือกแผนก --</option>
            {form.department && !departments.includes(form.department) && <option value={form.department}>{form.department} (ไม่ตรงรายการ)</option>}
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {me.role !== 'Admin' && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>แผนกเปลี่ยนได้เฉพาะผู้ดูแลระบบ</div>}
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.email_notify} onChange={(e) => setForm(v => ({ ...v, email_notify: e.target.checked }))} style={{ width: 16, height: 16 }} />
            รับการแจ้งเตือนทางอีเมล
          </label>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </div>
      </form>
    </Modal>
  );
}
