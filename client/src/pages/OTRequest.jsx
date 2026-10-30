// client/src/pages/OTRequest.jsx - ฟอร์มสร้าง/แก้ไขคำขอ OT
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const OT_TYPES = ['Project', 'Service', 'Visit', 'Site Survey', 'Internal'];

// วันที่ตามเวลาท้องถิ่นของเครื่อง (toISOString ใช้ UTC ทำให้ช่วงเที่ยงคืน-7 โมงเช้าของไทยได้วันที่เมื่อวาน)
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ค่าเริ่มต้นตามปฏิทิน: เสาร์-อาทิตย์ = วันหยุด (ผู้ขอเปลี่ยนเองได้ เช่น เสาร์ที่เป็นเวร)
const calendarDayType = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d)) return 'workday';
  return d.getDay() === 0 || d.getDay() === 6 ? 'holiday' : 'workday';
};

const makeInitial = () => ({
  ot_date: todayLocal(),
  day_type: calendarDayType(todayLocal()),
  ot_type: '', customer_id: '', project_no: '', job_no: '',
  time_from: '18:00', time_to: '20:00',
  location: '', work_detail: '', reason: '', notes: ''
});

const toMinutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export default function OTRequest() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const id = params.get('id');
  const [form, setForm] = useState(makeInitial);
  const [existing, setExisting] = useState(null);
  const [saving, setSaving] = useState(false);

  // ค้นหาลูกค้าแบบพิมพ์แล้วค้นหา (ลูกค้ามีนับพันรายการ โหลดทั้งหมดทีเดียวไม่ไหว) — รูปแบบเดียวกับหน้า Visit
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [customerOpen, setCustomerOpen] = useState(false);

  useEffect(() => {
    const q = customerQuery.trim();
    if (!q || form.customer_id) { setCustomerResults([]); return; }
    const t = setTimeout(() => {
      api.get(`/api/customers?q=${encodeURIComponent(q)}`)
        .then(r => setCustomerResults(r.customers.slice(0, 20)))
        .catch(() => setCustomerResults([]));
    }, 250); // debounce กันยิง API ถี่เกินไปตอนพิมพ์
    return () => clearTimeout(t);
  }, [customerQuery, form.customer_id]);

  useEffect(() => {
    if (!id) { setExisting(null); setForm(makeInitial()); setCustomerQuery(''); return; }
    api.get(`/api/ot-requests/${id}`).then(({ request: r }) => {
      // ห้ามแก้ไขตอน pending เพราะกำลังอยู่ระหว่างอนุมัติ (อาจผ่านบาง State ไปแล้ว) - แก้ได้เฉพาะ draft/revision
      if (!['draft', 'revision'].includes(r.status)) {
        toast('ไม่สามารถแก้ไขคำขอนี้ได้แล้ว', 'error');
        navigate('/my-ot');
        return;
      }
      setExisting(r);
      setDayTypeTouched(!!r.day_type); // ใบที่เคยบันทึกประเภทวันไว้แล้ว ไม่ให้เปลี่ยนวันที่แล้วทับค่าเดิม
      setForm({
        ot_date: r.ot_date, time_from: r.time_from, time_to: r.time_to,
        day_type: r.day_type || calendarDayType(r.ot_date),
        ot_type: r.ot_type || '', customer_id: r.customer_id || '', project_no: r.project_no || '', job_no: r.job_no || '',
        location: r.location || '', work_detail: r.work_detail || '', reason: r.reason || '', notes: r.notes || ''
      });
      setCustomerQuery(r.customer_id ? `${r.customer_code} - ${r.customer_name}` : '');
    }).catch(err => toast(err.message, 'error'));
  }, [id]);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  // เปลี่ยนวันที่ -> ปรับประเภทวันตามปฏิทินให้ แต่ถ้าผู้ขอเลือกประเภทวันเองไปแล้ว จะไม่เขียนทับ
  const [dayTypeTouched, setDayTypeTouched] = useState(false);
  const changeDate = (e) => {
    const v = e.target.value;
    setForm(f => ({ ...f, ot_date: v, day_type: dayTypeTouched || !v ? f.day_type : calendarDayType(v) }));
  };

  const pickCustomer = (c) => {
    setForm(f => ({ ...f, customer_id: c.id }));
    setCustomerQuery(`${c.code} - ${c.name}`);
    setCustomerOpen(false);
  };

  // คำนวณชั่วโมง OT อัตโนมัติจากเวลาเริ่ม-สิ้นสุด (ผู้ใช้ไม่ต้องกรอกเอง) — null ถ้าเวลายังไม่ครบหรือสิ้นสุดไม่มากกว่าเริ่ม
  const fromMin = toMinutes(form.time_from);
  const toMin = toMinutes(form.time_to);
  const timesFilled = fromMin !== null && toMin !== null;
  const timeOrderBad = timesFilled && toMin <= fromMin;
  const hours = timesFilled && !timeOrderBad ? Math.round(((toMin - fromMin) / 60) * 100) / 100 : null;

  const fail = (msg, fieldId) => {
    toast(msg, 'error');
    if (fieldId) { const el = document.getElementById(fieldId); if (el) el.focus(); }
  };

  const validate = (isDraft) => {
    if (!isDraft) {
      if (!form.ot_date) return fail('กรุณาระบุวันที่ทำ OT', 'ot-date');
      if (!form.ot_type) return fail('กรุณาเลือก OT Type', 'ot-type');
      if (!form.location.trim()) return fail('กรุณาระบุสถานที่ปฏิบัติงาน', 'ot-location');
      if (!form.time_from) return fail('กรุณาระบุเวลาเริ่มต้น', 'ot-time-from');
      if (!form.time_to) return fail('กรุณาระบุเวลาสิ้นสุด', 'ot-time-to');
    }
    if (timeOrderBad) return fail('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น', 'ot-time-to');
    if (customerQuery.trim() && !form.customer_id) return fail('กรุณาเลือกลูกค้าจากรายการค้นหา หรือลบข้อความที่พิมพ์ออก', 'ot-customer');
    if (!isDraft && !form.work_detail.trim()) return fail('กรุณาระบุรายละเอียดงานที่ทำ', 'ot-work-detail');
    return true;
  };

  const save = async (isDraft) => {
    if (validate(isDraft) !== true) return;
    setSaving(true);
    const payload = { ...form, customer_id: form.customer_id || null, save_as: isDraft ? 'draft' : undefined };
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
          <form noValidate onSubmit={e => { e.preventDefault(); save(false); }}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="ot-date">วันที่ทำ OT <span className="req">*</span></label>
                <input id="ot-date" type="date" value={form.ot_date} onChange={changeDate} required />
              </div>
              <div className="form-group">
                <label htmlFor="ot-daytype">ประเภทวัน <span className="req">*</span></label>
                <select id="ot-daytype" value={form.day_type} onChange={(e) => { setDayTypeTouched(true); set('day_type')(e); }}>
                  <option value="workday">วันทำงาน</option>
                  <option value="holiday">วันหยุด</option>
                </select>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>เลือกให้อัตโนมัติตามปฏิทิน (เสาร์-อาทิตย์ = วันหยุด) เปลี่ยนเองได้ เช่น เสาร์ที่เป็นเวร</div>
              </div>
              <div className="form-group">
                <label htmlFor="ot-location">สถานที่ปฏิบัติงาน <span className="req">*</span></label>
                <input id="ot-location" type="text" value={form.location} onChange={set('location')} placeholder="เช่น สำนักงานใหญ่, ที่ลูกค้า" required />
              </div>

              <div className="form-group">
                <label htmlFor="ot-type">OT Type <span className="req">*</span></label>
                <select id="ot-type" value={form.ot_type} onChange={set('ot_type')} required>
                  <option value="">-- เลือก OT Type --</option>
                  {OT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ position: 'relative' }}>
                <label htmlFor="ot-customer">Customer</label>
                <input
                  id="ot-customer"
                  type="text"
                  value={customerQuery}
                  placeholder="พิมพ์รหัสลูกค้าหรือชื่อบริษัทเพื่อค้นหา"
                  onChange={(e) => {
                    setCustomerQuery(e.target.value);
                    setCustomerOpen(true);
                    if (form.customer_id) setForm(f => ({ ...f, customer_id: '' }));
                  }}
                  onFocus={() => setCustomerOpen(true)}
                  onBlur={() => setTimeout(() => setCustomerOpen(false), 150)}
                  autoComplete="off"
                />
                {customerQuery && !form.customer_id && (
                  <div style={{ fontSize: 12, color: '#c0392b', marginTop: 4 }}>กรุณาเลือกลูกค้าจากรายการค้นหา</div>
                )}
                {customerOpen && customerResults.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                    background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8,
                    maxHeight: 260, overflowY: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,0.12)'
                  }}>
                    {customerResults.map(c => (
                      <div
                        key={c.id}
                        onMouseDown={() => pickCustomer(c)}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f2f2f2' }}
                      >
                        <div style={{ fontWeight: 600 }}>{c.code} — {c.name}</div>
                        {c.company && <div style={{ color: '#888' }}>{c.company}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="ot-project-no">Project No.</label>
                <input id="ot-project-no" type="text" value={form.project_no} onChange={set('project_no')} maxLength={50} placeholder="เช่น PJ-2026-001" />
              </div>
              <div className="form-group">
                <label htmlFor="ot-job-no">Job No.</label>
                <input id="ot-job-no" type="text" value={form.job_no} onChange={set('job_no')} maxLength={50} placeholder="เช่น JOB-0123" />
              </div>

              <div className="form-group">
                <label htmlFor="ot-time-from">เวลาเริ่มต้น <span className="req">*</span></label>
                <input id="ot-time-from" type="time" value={form.time_from} onChange={set('time_from')} required />
              </div>
              <div className="form-group">
                <label htmlFor="ot-time-to">เวลาสิ้นสุด <span className="req">*</span></label>
                <input id="ot-time-to" type="time" value={form.time_to} onChange={set('time_to')} required />
              </div>
              <div className="form-group full">
                <div className="muted" style={{ fontSize: 12.5 }}>
                  จำนวนชั่วโมง OT โดยประมาณ: <b>{hours !== null ? `${hours} ชม.` : '-'}</b>
                </div>
                {timeOrderBad && (
                  <div role="alert" style={{ fontSize: 12, color: '#c0392b', marginTop: 4 }}>เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น</div>
                )}
              </div>
              <div className="form-group full">
                <label htmlFor="ot-work-detail">รายละเอียดงานที่ทำ <span className="req">*</span></label>
                <textarea id="ot-work-detail" value={form.work_detail} onChange={set('work_detail')} placeholder="อธิบายงานที่ทำในช่วง OT นี้" required />
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
