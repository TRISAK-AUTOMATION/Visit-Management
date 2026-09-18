// client/src/pages/Profile.jsx - เทียบเท่า public/profile.html
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../lib/AuthContext';
import { api, initials, ROLE_TH } from '../lib/api';
import { useToast } from '../lib/ToastContext';

export default function Profile() {
  const { me, setMe } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    full_name: me.full_name, email: me.email || '', phone: me.phone || '',
    position: me.position || '', department: me.department || '',
    email_notify: !!me.email_notify, avatar_url: me.avatar_url || ''
  });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [departments, setDepartments] = useState([]);
  const [leaveSummary, setLeaveSummary] = useState(null);

  useEffect(() => {
    api.get('/api/departments').then(({ departments }) => setDepartments(departments)).catch(() => {});
    api.get('/api/leave-requests/summary/me').then(setLeaveSummary).catch(() => {});
  }, []);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  const setCheckbox = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.checked }));

  const handleAvatarChange = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // เผื่ออยากเลือกไฟล์เดิมซ้ำอีกครั้ง
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('กรุณาเลือกไฟล์รูปภาพเท่านั้น', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { toast('ไฟล์รูปต้องมีขนาดไม่เกิน 2MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      setForm(f => ({ ...f, avatar_url: dataUrl }));
      setAvatarUploading(true);
      try {
        await api.put('/api/users/me', { ...form, avatar_url: dataUrl });
        setMe(m => ({ ...m, avatar_url: dataUrl }));
        toast('อัปเดตรูปโปรไฟล์สำเร็จ', 'success');
      } catch (err) { toast(err.message, 'error'); }
      finally { setAvatarUploading(false); }
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      await api.put('/api/users/me', form);
      setMe(m => ({ ...m, ...form }));
      toast('บันทึกข้อมูลสำเร็จ', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    try {
      await api.put('/api/users/me/password', pw);
      toast('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
      setPw({ current_password: '', new_password: '' });
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <Layout title="โปรไฟล์">
      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>ข้อมูลส่วนตัว</h3></div>
          <div className="card-body">
            <div className="flex gap-12 mb-16">
              <label style={{ position: 'relative', width: 64, height: 64, cursor: 'pointer', flexShrink: 0 }} title="คลิกเพื่อเปลี่ยนรูปโปรไฟล์">
                <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} disabled={avatarUploading} />
                {form.avatar_url ? (
                  <img src={form.avatar_url} alt="รูปโปรไฟล์" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div className="pill-avatar" style={{ width: 64, height: 64, fontSize: 20 }}>{initials(me.full_name)}</div>
                )}
                <div style={{
                  position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--blue-600)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, border: '2px solid #fff'
                }}>{avatarUploading ? '…' : '📷'}</div>
              </label>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{me.full_name}</div>
                <div className="muted">{me.position || '-'} · {ROLE_TH[me.role]}</div>
              </div>
            </div>
            <form onSubmit={saveProfile}>
              <div className="form-group"><label>ชื่อ-นามสกุล</label><input value={form.full_name} onChange={set('full_name')} /></div>
              <div className="form-group"><label>อีเมล</label><input value={form.email} onChange={set('email')} /></div>
              <div className="form-group"><label>เบอร์โทร</label><input value={form.phone} onChange={set('phone')} /></div>
              <div className="form-group"><label>ตำแหน่ง</label><input value={form.position} onChange={set('position')} /></div>
              <div className="form-group">
                <label>แผนก</label>
                <select value={form.department} onChange={set('department')}>
                  <option value="">-- เลือกแผนก --</option>
                  {form.department && !departments.includes(form.department) && (
                    <option value={form.department}>{form.department} (ไม่ตรงรายการ)</option>
                  )}
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.email_notify} onChange={setCheckbox('email_notify')} style={{ width: 16, height: 16 }} />
                  รับการแจ้งเตือนทางอีเมล (คำขอใหม่ / ผลการอนุมัติ)
                </label>
              </div>
              <div className="form-actions"><button type="submit" className="btn btn-primary">บันทึก</button></div>
            </form>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>เปลี่ยนรหัสผ่าน</h3></div>
          <div className="card-body">
            <form onSubmit={changePassword}>
              <div className="form-group"><label>รหัสผ่านปัจจุบัน</label><input type="password" value={pw.current_password} onChange={e => setPw(p => ({ ...p, current_password: e.target.value }))} required /></div>
              <div className="form-group"><label>รหัสผ่านใหม่</label><input type="password" value={pw.new_password} onChange={e => setPw(p => ({ ...p, new_password: e.target.value }))} required /></div>
              <div className="form-actions"><button type="submit" className="btn btn-primary">เปลี่ยนรหัสผ่าน</button></div>
            </form>
          </div>
        </div>
      </div>

      {leaveSummary && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-head"><h3>สรุปวันลาของฉัน (ปีนี้)</h3></div>
          <div className="card-body">
            <div className="dept-grid">
              <div className="stat-card sm blue">
                <div className="label">ลาพักร้อนคงเหลือ</div>
                <div className="value">{leaveSummary.vacation_remaining}<span className="unit">/ {leaveSummary.vacation_total} วัน</span></div>
              </div>
              <div className="stat-card sm orange">
                <div className="label">ลากิจคงเหลือ</div>
                <div className="value">{leaveSummary.personal_remaining}<span className="unit">/ {leaveSummary.personal_total} วัน</span></div>
              </div>
              <div className="stat-card sm red">
                <div className="label">ลาป่วยคงเหลือ</div>
                <div className="value">{leaveSummary.sick_remaining}<span className="unit">/ {leaveSummary.sick_total} วัน</span></div>
              </div>
              <div className="stat-card sm teal">
                <div className="label">รวมวันลาสะสม (ปีนี้)</div>
                <div className="value">{leaveSummary.total_days_used}<span className="unit">วัน</span></div>
              </div>
              <div className="stat-card sm purple">
                <div className="label">รวมชั่วโมงลาสะสม</div>
                <div className="value">{leaveSummary.total_hours_used}<span className="unit">ชม.</span></div>
              </div>
              <div className="stat-card sm slate">
                <div className="label">จำนวนครั้งที่ลา (ปีนี้)</div>
                <div className="value" style={{ fontSize: 15 }}>กิจ {leaveSummary.by_type['ลากิจ'].cnt} · ป่วย {leaveSummary.by_type['ลาป่วย'].cnt}</div>
              </div>
            </div>
            <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 4 }}>
              <a className="btn btn-outline btn-sm" href="/my-leave">ดูประวัติการลาทั้งหมด →</a>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
