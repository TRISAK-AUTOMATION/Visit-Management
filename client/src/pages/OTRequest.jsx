// client/src/pages/OTRequest.jsx - ฟอร์มสร้าง/แก้ไขคำขอ OT
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const initial = {
  ot_date: new Date().toISOString().slice(0, 10),
  time_from: '18:00', time_to: '20:00',
  location: '', work_detail: '', reason: '', notes: ''
};

export default function OTRequest() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const id = params.get('id');
  const [form, setForm] = useState(initial);
  const [existing, setExisting] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) { setExisting(null); setForm(initial); return; }
    api.get(`/api/ot-requests/${id}`).then(({ request: r }) => {
      if (!['draft', 'pending'].includes(r.status)) {
        toast('ไม่สามารถแก้ไขคำขอนี้ได้แล้ว', 'error');
        navigate('/my-ot');
        return;
      }
      setExisting(r);
      setForm({
        ot_date: r.ot_date, time_from: r.time_from, time_to: r.time_to,
        location: r.location || '', work_detail: r.work_detail || '', reason: r.reason || '', notes: r.notes || ''
      });
    }).catch(err => toast(err.message, 'error'));
  }, [id]);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const hoursPreview = () => {
    const [fh, fm] = (form.time_from || '0:0').split(':').map(Number);
    const [th, tm] = (form.time_to || '0:0').split(':').map(Number);
    let mins = (th * 60 + tm) - (fh * 60 + fm);
    if (mins < 0) mins += 24 * 60;
    return Math.round((mins / 60) * 100) / 100;
  };

  const save = async (isDraft) => {
    if (!isDraft) {
      if (!form.ot_date) { toast('กรุณาระบุวันที่ทำ OT', 'error'); return; }
      if (!form.time_from || !form.time_to) { toast('กรุณาระบุเวลาเริ่มต้น-สิ้นสุด', 'error'); return; }
      if (!form.work_detail.trim()) { toast('กรุณาระบุรายละเอียดงานที่ทำ', 'error'); return; }
    }
    setSaving(true);
    const payload = { ...form, save_as: isDraft ? 'draft' : undefined };
    try {
      if (existing) {
        await api.put(`/api/ot-requests/${existing.id}`, payload);
        if (!isDraft && existing.status === 'draft') await api.post(`/api/ot-requests/${existing.id}/submit`);
        toast('บันทึกสำเร็จ', 'success');
      } else {
        const r = await api.post('/api/ot-requests', payload);
        toast(isDraft ? `บันทึกฉบับร่างสำเร็จ (${r.code})` : `ส่งคำขอ OT สำเร็จ (${r.code})`, 'success');
      }
      setTimeout(() => navigate('/my-ot'), 600);
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Layout title={existing ? `แก้ไขคำขอ OT #${existing.code}` : 'สร้างคำขอ OT (Overtime Request)'}>
      <div className="card" style={{ maxWidth: 700 }}>
        <div className="card-head"><h3>ข้อมูลการขอทำงานล่วงเวลา</h3></div>
        <div className="card-body">
          <form onSubmit={e => { e.preventDefault(); save(false); }}>
            <div className="form-grid">
              <div className="form-group">
                <label>วันที่ทำ OT <span className="req">*</span></label>
                <input type="date" value={form.ot_date} onChange={set('ot_date')} required />
              </div>
              <div className="form-group">
                <label>สถานที่ปฏิบัติงาน</label>
                <input type="text" value={form.location} onChange={set('location')} placeholder="เช่น สำนักงานใหญ่, ที่ลูกค้า" />
              </div>
              <div className="form-group">
                <label>เวลาเริ่มต้น <span className="req">*</span></label>
                <input type="time" value={form.time_from} onChange={set('time_from')} required />
              </div>
              <div className="form-group">
                <label>เวลาสิ้นสุด <span className="req">*</span></label>
                <input type="time" value={form.time_to} onChange={set('time_to')} required />
              </div>
              <div className="form-group full">
                <div className="muted" style={{ fontSize: 12.5 }}>จำนวนชั่วโมง OT โดยประมาณ: <b>{hoursPreview()} ชม.</b></div>
              </div>
              <div className="form-group full">
                <label>รายละเอียดงานที่ทำ <span className="req">*</span></label>
                <textarea value={form.work_detail} onChange={set('work_detail')} placeholder="อธิบายงานที่ทำในช่วง OT นี้" required />
              </div>
              <div className="form-group full">
                <label>เหตุผลในการทำ OT</label>
                <textarea value={form.reason} onChange={set('reason')} placeholder="เช่น งานเร่งด่วน, ลูกค้าต้องการด่วน" />
              </div>
              <div className="form-group full">
                <label>หมายเหตุเพิ่มเติม</label>
                <textarea value={form.notes} onChange={set('notes')} />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-outline" onClick={() => navigate('/my-ot')}>ยกเลิก</button>
              {(!existing || existing.status === 'draft') && (
                <button type="button" className="btn btn-outline" disabled={saving} onClick={() => save(true)}>บันทึกฉบับร่าง</button>
              )}
              <button type="submit" className="btn btn-primary" disabled={saving}>ส่งคำขอ</button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
