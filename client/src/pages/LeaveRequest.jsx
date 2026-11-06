// client/src/pages/LeaveRequest.jsx - ฟอร์มสร้าง/แก้ไขคำขอลา
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { api, todayLocal } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const LEAVE_TYPES = ['ลากิจ', 'ลาป่วย', 'ลาพักร้อน'];
const MODES = [
  { v: 'full_day', label: 'ลาเต็มวัน' },
  { v: 'half_day_morning', label: 'ลาครึ่งวัน (เช้า)' },
  { v: 'half_day_afternoon', label: 'ลาครึ่งวัน (บ่าย)' },
  { v: 'hours', label: 'ลาตามชั่วโมง/นาที (ระบุเวลาเริ่ม-สิ้นสุด)' },
];

const initial = {
  leave_type: LEAVE_TYPES[0], leave_mode: 'full_day',
  date_from: todayLocal(), date_to: '',
  time_from: '09:00', time_to: '10:00',
  reason: '', attachment: ''
};

export default function LeaveRequest() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const id = params.get('id');
  const [form, setForm] = useState(initial);
  const [existing, setExisting] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) { setExisting(null); setForm(initial); return; }
    api.get(`/api/leave-requests/${id}`).then(({ request: r }) => {
      // แก้ไขได้เฉพาะ draft / revision (ถูกส่งกลับให้แก้) - pending อยู่ระหว่างอนุมัติจึงห้ามแก้ (ตรงกับ EDITABLE_STATUSES ฝั่ง server)
      if (!['draft', 'revision'].includes(r.status)) {
        toast('ไม่สามารถแก้ไขคำขอนี้ได้แล้ว', 'error');
        navigate('/my-leave');
        return;
      }
      setExisting(r);
      setForm({
        leave_type: r.leave_type, leave_mode: r.leave_mode,
        date_from: r.date_from, date_to: r.date_to || r.date_from,
        time_from: r.time_from || '09:00', time_to: r.time_to || '10:00',
        reason: r.reason || '', attachment: r.attachment || ''
      });
    }).catch(err => toast(err.message, 'error'));
  }, [id]);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast('ไฟล์ต้องมีขนาดไม่เกิน 4MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, attachment: reader.result }));
    reader.readAsDataURL(file);
  };

  const isHalfOrHours = form.leave_mode !== 'full_day';

  const save = async (isDraft) => {
    if (!isDraft) {
      if (!form.date_from) { toast('กรุณาระบุวันที่ลา', 'error'); return; }
      if (!form.reason.trim()) { toast('กรุณาระบุเหตุผลการลา', 'error'); return; }
      if (form.leave_mode === 'hours' && (!form.time_from || !form.time_to)) {
        toast('กรุณาระบุเวลาเริ่มต้น-สิ้นสุด', 'error'); return;
      }
    }
    setSaving(true);
    const payload = { ...form, date_to: form.leave_mode === 'full_day' ? (form.date_to || form.date_from) : form.date_from, save_as: isDraft ? 'draft' : undefined };
    try {
      if (existing) {
        await api.put(`/api/leave-requests/${existing.id}`, payload);
        if (!isDraft && existing.status === 'draft') await api.post(`/api/leave-requests/${existing.id}/submit`);
        // ใบที่ถูกตีกลับ: บันทึกแล้วส่งใหม่เข้า workflow ทันที (เริ่มจาก State แรก)
        if (!isDraft && existing.status === 'revision') await api.post(`/api/leave-requests/${existing.id}/resubmit`);
        toast(!isDraft && existing.status === 'revision' ? 'แก้ไขและส่งคำขอใหม่สำเร็จ' : 'บันทึกสำเร็จ', 'success');
      } else {
        const r = await api.post('/api/leave-requests', payload);
        toast(isDraft ? `บันทึกฉบับร่างสำเร็จ (${r.code})` : `ส่งคำขอลาสำเร็จ (${r.code})`, 'success');
      }
      setTimeout(() => navigate('/my-leave'), 600);
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Layout title={existing ? `แก้ไขคำขอลา #${existing.code}` : 'สร้างคำขอลา (Leave Request)'}>
      <div className="card" style={{ maxWidth: 700 }}>
        <div className="card-head"><h3>ข้อมูลการลา</h3></div>
        <div className="card-body">
          <form onSubmit={e => { e.preventDefault(); save(false); }}>
            <div className="form-grid">
              <div className="form-group">
                <label>ประเภทการลา <span className="req">*</span></label>
                <select value={form.leave_type} onChange={set('leave_type')} required>
                  {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>รูปแบบการลา <span className="req">*</span></label>
                <select value={form.leave_mode} onChange={set('leave_mode')} required>
                  {MODES.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>วันที่เริ่มลา <span className="req">*</span></label>
                <input type="date" value={form.date_from} onChange={set('date_from')} required />
              </div>
              {form.leave_mode === 'full_day' && (
                <div className="form-group">
                  <label>วันที่สิ้นสุด (ถ้าลาหลายวัน) <span className="req">*</span></label>
                  <input type="date" value={form.date_to || form.date_from} onChange={set('date_to')} min={form.date_from} required />
                </div>
              )}
              {form.leave_mode === 'hours' && (
                <>
                  <div className="form-group">
                    <label>เวลาเริ่มต้น <span className="req">*</span></label>
                    <input type="time" value={form.time_from} onChange={set('time_from')} required />
                  </div>
                  <div className="form-group">
                    <label>เวลาสิ้นสุด <span className="req">*</span></label>
                    <input type="time" value={form.time_to} onChange={set('time_to')} required />
                  </div>
                </>
              )}
              <div className="form-group full">
                <label>เหตุผลการลา <span className="req">*</span></label>
                <textarea value={form.reason} onChange={set('reason')} placeholder="ระบุเหตุผลการลา" required />
              </div>
              <div className="form-group full">
                <label>แนบเอกสารประกอบ (ถ้ามี)</label>
                <input type="file" onChange={handleFile} />
                {form.attachment && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>แนบไฟล์แล้ว ✓</div>}
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-outline" onClick={() => navigate('/my-leave')}>ยกเลิก</button>
              {(!existing || existing.status === 'draft') && (
                <button type="button" className="btn btn-outline" disabled={saving} onClick={() => save(true)}>บันทึกฉบับร่าง</button>
              )}
              <button type="submit" className="btn btn-primary" disabled={saving}>{existing && existing.status === 'revision' ? 'บันทึกและส่งใหม่' : 'ส่งคำขอ'}</button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
