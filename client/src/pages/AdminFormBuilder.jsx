// client/src/pages/AdminFormBuilder.jsx - Admin CMS: จัดการ Field ของฟอร์ม "สร้างคำขอ Visit" แบบ Dynamic
// เพิ่ม/ลบ/แก้ไข/จัดลำดับ/เปิดปิด Field ได้จากหน้านี้โดยไม่ต้องแก้ Source Code
import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const FIELD_TYPES = [
  { v: 'text', label: 'ข้อความสั้น (Text)' },
  { v: 'textarea', label: 'ข้อความยาว (Textarea)' },
  { v: 'number', label: 'ตัวเลข (Number)' },
  { v: 'email', label: 'อีเมล (Email)' },
  { v: 'phone', label: 'เบอร์โทร (Phone)' },
  { v: 'date', label: 'วันที่ (Date)' },
  { v: 'time', label: 'เวลา (Time)' },
  { v: 'datetime', label: 'วันที่ + เวลา (Date + Time)' },
  { v: 'dropdown', label: 'ตัวเลือกเดียว (Dropdown)' },
  { v: 'multiselect', label: 'หลายตัวเลือก (Multi Select)' },
  { v: 'checkbox', label: 'กาถูก/ไม่ถูก (Checkbox)' },
  { v: 'radio', label: 'ตัวเลือกแบบปุ่ม (Radio)' },
  { v: 'file', label: 'แนบไฟล์ (File Upload)' },
];
const OPTION_TYPES = ['dropdown', 'multiselect', 'radio'];
const typeLabel = (v) => (FIELD_TYPES.find(t => t.v === v) || {}).label || v;

// field ที่จำเป็นต่อระบบ (ซ่อน/ลบไม่ได้ ต้องแสดง+บังคับกรอกเสมอ) แต่แก้ "ชื่อหัวข้อ (Label)" ได้ผ่าน essential_field_labels
// รายการนี้เป็นค่า default ไว้ใช้ระหว่างรอโหลดจาก backend เท่านั้น ของจริงมาจาก essentialLabels state ด้านล่าง
const ESSENTIAL_FIELDS_DEFAULT = [
  { field_key: 'visit_date', label: 'วันที่' },
  { field_key: 'customer_id', label: 'รหัสลูกค้า / บริษัท' },
  { field_key: 'time_from', label: 'เวลาเริ่ม (แผน)' },
  { field_key: 'time_to', label: 'เวลาสิ้นสุด (แผน)' }
];

const emptyForm = {
  field_key: '', label: '', field_type: 'text', placeholder: '', description: '',
  optionsText: '', is_required: false, default_value: '', show_in_email: false, position_after: ''
};

// โครงของฟอร์ม "สร้างคำขอ Visit" เรียงตามที่แสดงจริง — key ใน anchors คือ field ที่ Custom Field วาง "ต่อจาก" ได้
// builtin = Field ที่มีในฟอร์มอยู่แล้ว (แสดงให้เห็นภาพรวม), end = ตำแหน่ง "ท้ายกลุ่ม"
const FORM_GROUPS = [
  { end: 'GRP_company', title: 'ข้อมูลบริษัท', en: 'Company Information', anchors: [], builtin: ['Company (บริษัทในเครือที่รับผิดชอบ)'] },
  { end: 'GRP_customer', title: 'ข้อมูลลูกค้า', en: 'Customer Information', anchors: ['customer_id', 'sales_person', 'customer_tax_id', 'tax_invoice_date'],
    builtin: ['Customer Type', 'Customer Code', 'Customer Name', 'SSO', 'Sales Name', 'Customer Tax ID'] },
  { end: 'GRP_contact', title: 'ข้อมูลผู้ติดต่อ', en: 'Contact Information', anchors: ['contact_person', 'contact_phone'], builtin: ['Contact (ชื่อ / ตำแหน่ง / เบอร์โทร / อีเมล) — เพิ่มได้หลายคน'] },
  { end: 'GRP_visit', title: 'ข้อมูลการเข้าพบ', en: 'Visit Information', anchors: ['TOP', 'visit_date', 'time_from', 'time_to', 'job_type', 'transport', 'license_plate', 'purpose', 'location', 'product'],
    builtin: ['Request Date', 'Visit Date', 'Time Out / In', 'Job Type', 'Transport', 'Car License', 'Purpose', 'Location', 'Product'] },
  { end: 'GRP_people', title: 'ผู้ร่วมงาน', en: 'Accompanied Employees', anchors: ['participants'], builtin: ['Employees'] },
  { end: 'GRP_trip', title: 'การเดินทาง / หลังปฏิบัติงาน', en: 'Trip & Post-visit', anchors: ['mileage_out', 'mileage_in', 'actual_time_out', 'actual_time_back', 'ot_hours'],
    builtin: ['Mileage Out/In', 'Actual Time Out/Back', 'OT Hours'] },
  { end: 'notes', title: 'หมายเหตุ (Remark)', en: 'Remark', anchors: ['notes'], builtin: ['Remark'] }
];

// หาว่า Custom Field นี้ไปอยู่กลุ่มไหนของฟอร์ม (ตามตำแหน่งที่วาง รวมกรณีวางต่อจาก Custom Field อื่น)
function groupOfField(f, all) {
  let pos = f.position_after || '';
  for (let i = 0; i < 10 && pos; i++) {
    const g = FORM_GROUPS.find(x => x.end === pos || x.anchors.includes(pos));
    if (g) return g;
    const parent = all.find(x => x.field_key === pos);
    if (!parent) break;
    pos = parent.position_after || '';
  }
  return null;
}

export default function AdminFormBuilder() {
  const toast = useToast();
  const [fields, setFields] = useState([]);
  const [editing, setEditing] = useState(undefined); // undefined=ปิด, null=เพิ่มใหม่, object=แก้ไข
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Field เดิมของระบบ (ผูกกับคอลัมน์จริง) - ซ่อน/เปลี่ยนชื่อ/บังคับกรอกได้ แต่ลบไม่ได้
  const [coreFields, setCoreFields] = useState([]);
  const [editingCore, setEditingCore] = useState(null); // { field_key, label, is_visible, is_required } หรือ null
  const [coreForm, setCoreForm] = useState({ label: '', is_visible: true, is_required: false });
  const [savingCore, setSavingCore] = useState(false);

  // Field พื้นฐานที่จำเป็นต่อระบบ (วันที่/ลูกค้า/เวลา) - แสดง+บังคับกรอกเสมอ แก้ได้แค่ชื่อหัวข้อ (Label)
  const [essentialLabels, setEssentialLabels] = useState(ESSENTIAL_FIELDS_DEFAULT);
  const ESSENTIAL_FIELDS = essentialLabels; // ใช้ชื่อเดิมต่อในโค้ดที่เหลือ (position_after dropdown ฯลฯ)
  const [editingEssential, setEditingEssential] = useState(null); // { field_key, label } หรือ null
  const [essentialLabel, setEssentialLabel] = useState('');
  const [savingEssential, setSavingEssential] = useState(false);

  const loadEssential = async () => {
    const { labels } = await api.get('/api/core-field-settings/essential-labels');
    if (labels && labels.length) setEssentialLabels(labels);
  };

  const openEssentialEdit = (f) => {
    setEditingEssential(f);
    setEssentialLabel(f.label);
  };

  const submitEssentialEdit = async (e) => {
    e.preventDefault();
    setSavingEssential(true);
    try {
      await api.put(`/api/core-field-settings/essential-labels/${editingEssential.field_key}`, { label: essentialLabel });
      toast('บันทึกสำเร็จ', 'success');
      setEditingEssential(null);
      loadEssential();
    } catch (err) { toast(err.message, 'error'); }
    setSavingEssential(false);
  };

  const loadCore = async () => {
    const { settings } = await api.get('/api/core-field-settings');
    setCoreFields(settings); // เรียงตาม sort_order มาจาก backend แล้ว
  };

  // จัดลำดับ Field เดิมของระบบใหม่ (สลับตำแหน่งขึ้น/ลง เหมือน Field ที่ Admin สร้างเอง)
  const moveCore = async (idx, dir) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= coreFields.length) return;
    const reordered = [...coreFields];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    setCoreFields(reordered);
    try {
      await api.patch('/api/core-field-settings/reorder', { order: reordered.map(f => f.field_key) });
    } catch (err) { toast(err.message, 'error'); loadCore(); }
  };

  // แปลงค่า position_after ที่เก็บใน DB ให้เป็นข้อความอ่านง่ายในตาราง
  const positionLabel = (posAfter) => {
    if (!posAfter) return 'ท้ายฟอร์ม';
    if (posAfter === 'TOP') return 'บนสุดของฟอร์ม';
    const grpEnd = FORM_GROUPS.find(g => g.end === posAfter);
    if (grpEnd) return `ท้ายกลุ่ม: ${grpEnd.title}`;
    const essential = ESSENTIAL_FIELDS.find(f => f.field_key === posAfter);
    if (essential) return `หลัง: ${essential.label}`;
    const core = coreFields.find(f => f.field_key === posAfter);
    if (core) return `หลัง: ${core.label}`;
    const custom = fields.find(f => f.field_key === posAfter);
    if (custom) return `หลัง: ${custom.label}`;
    return `หลัง: ${posAfter}`;
  };

  const openCoreEdit = (f) => {
    setEditingCore(f);
    setCoreForm({ label: f.label, is_visible: f.is_visible, is_required: f.is_required });
  };

  // เปิด/ปิด "แสดงใน Email" ของ Field เดิม แบบไม่ต้องเปิด modal (เหมือน toggleActive ของ Field ที่สร้างเอง)
  const toggleCoreEmail = async (f) => {
    const next = !f.show_in_email;
    setCoreFields(list => list.map(x => x.field_key === f.field_key ? { ...x, show_in_email: next } : x));
    try {
      await api.patch(`/api/core-field-settings/${f.field_key}/email`, { show_in_email: next });
    } catch (err) { toast(err.message, 'error'); loadCore(); }
  };

  const setCoreFormField = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setCoreForm(f => ({ ...f, [field]: val }));
  };

  const submitCoreEdit = async (e) => {
    e.preventDefault();
    setSavingCore(true);
    try {
      await api.put(`/api/core-field-settings/${editingCore.field_key}`, coreForm);
      toast('บันทึกสำเร็จ', 'success');
      setEditingCore(null);
      loadCore();
    } catch (err) { toast(err.message, 'error'); }
    setSavingCore(false);
  };

  const load = async () => {
    const { fields } = await api.get('/api/form-fields?all=1');
    setFields(fields);
  };

  useEffect(() => { load(); loadCore(); loadEssential(); }, []);

  const openForm = (f, presetPos) => {
    setEditing(f || null);
    setForm(f
      ? {
        field_key: f.field_key, label: f.label, field_type: f.field_type,
        placeholder: f.placeholder || '', description: f.description || '',
        optionsText: (f.options || []).join('\n'), is_required: f.is_required,
        default_value: f.default_value || '', show_in_email: f.show_in_email,
        position_after: f.position_after || ''
      }
      : { ...emptyForm, position_after: presetPos || '' });
  };

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [field]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        label: form.label,
        field_type: form.field_type,
        placeholder: form.placeholder,
        description: form.description,
        options: form.optionsText.split('\n').map(s => s.trim()).filter(Boolean),
        is_required: form.is_required,
        default_value: form.default_value,
        show_in_email: form.show_in_email,
        position_after: form.position_after
      };
      if (editing) {
        await api.put(`/api/form-fields/${editing.id}`, payload);
      } else {
        await api.post('/api/form-fields', { ...payload, field_key: form.field_key.trim() });
      }
      toast('บันทึกสำเร็จ', 'success');
      setEditing(undefined);
      load();
    } catch (err) { toast(err.message, 'error'); }
    setSaving(false);
  };

  const remove = async (f) => {
    if (!confirm(`ต้องการลบ Field "${f.label}" ใช่หรือไม่?\n\nคำเตือน: ข้อมูลที่เคยกรอกไว้ในคำขอ Visit เก่าจะยังอยู่ในฐานข้อมูล แต่จะไม่มีชื่อหัวข้อกำกับให้แสดงอีกต่อไป หากต้องการเก็บข้อมูลไว้ แนะนำให้กด "ปิดใช้งาน" แทนการลบ`)) return;
    try {
      await api.del(`/api/form-fields/${f.id}`);
      toast('ลบสำเร็จ', 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const toggleActive = async (f) => {
    try {
      await api.patch(`/api/form-fields/${f.id}/active`, { is_active: !f.is_active });
      toast(!f.is_active ? 'เปิดใช้งาน Field แล้ว' : 'ปิดใช้งาน Field แล้ว', 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const move = async (idx, dir) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= fields.length) return;
    const reordered = [...fields];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    setFields(reordered); // อัปเดต UI ทันทีให้รู้สึกลื่นไหล
    try {
      await api.patch('/api/form-fields/reorder', { order: reordered.map(f => f.id) });
    } catch (err) { toast(err.message, 'error'); load(); }
  };

  return (
    <Layout title="Form Builder — สร้างคำขอ Visit">
      <div className="flex between mb-16">
        <div>
          <h3 style={{ margin: 0 }}>Field เพิ่มเติมในฟอร์ม "สร้างคำขอ Visit"</h3>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            Field พื้นฐานของระบบ (บริษัท, วันที่, เวลา ฯลฯ) มีอยู่แล้วในฟอร์มเสมอ<br />
            หน้านี้ใช้เพิ่ม Field ใหม่ต่อท้าย โดยไม่ต้องแก้ Source Code
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => openForm(null)}>+ Add Field</button>
      </div>

      <div className="card mb-16">
        <div className="card-body">
          <h3 style={{ margin: '0 0 4px' }}>แผนผังฟอร์ม (เรียงตามที่แสดงจริงในหน้าสร้างคำขอ)</h3>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
            แต่ละกลุ่มแสดง Field ที่มีอยู่แล้วในระบบ และ Field ที่เพิ่มเอง — กด "+ เพิ่ม Field" ในกลุ่มไหน Field ใหม่จะไปอยู่ท้ายกลุ่มนั้นทันที
          </p>
          {FORM_GROUPS.map((g, gi) => {
            const mine = fields.filter(f => groupOfField(f, fields) === g);
            return (
              <div key={g.end} style={{ border: '1px solid var(--border, #e3e7ef)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                <div className="flex between" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div><b>{gi + 1}. {g.title}</b> <span className="muted" style={{ fontSize: 12 }}>{g.en}</span></div>
                  <button className="btn btn-outline btn-sm" onClick={() => openForm(null, g.end)}>+ เพิ่ม Field ในกลุ่มนี้</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {g.builtin.map(b => <span key={b} className="badge" style={{ background: '#eef1f7', color: '#4a5468', fontWeight: 500 }}>{b}</span>)}
                </div>
                {mine.length > 0 && (
                  <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                    {mine.map(f => (
                      <div key={f.id} className="flex between" style={{ alignItems: 'center', gap: 8, background: f.is_active ? '#eef6ff' : '#f5f5f5', borderRadius: 8, padding: '6px 10px', opacity: f.is_active ? 1 : 0.65 }}>
                        <div style={{ fontSize: 13 }}>
                          <b>{f.label}</b> <span className="muted" style={{ fontSize: 11 }}>{f.field_key} · {typeLabel(f.field_type)} · {positionLabel(f.position_after)}{f.is_required ? ' · จำเป็น' : ''}{f.is_active ? '' : ' · ปิดใช้งาน'}</span>
                        </div>
                        <div>
                          <button className="btn btn-outline btn-sm" onClick={() => openForm(f)}>แก้ไข</button>{' '}
                          <button className="btn btn-outline btn-sm" onClick={() => toggleActive(f)}>{f.is_active ? 'ปิด' : 'เปิด'}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {(() => {
            const loose = fields.filter(f => !groupOfField(f, fields));
            return loose.length > 0 && (
              <div style={{ border: '1px dashed #c5ccdb', borderRadius: 10, padding: '12px 14px' }}>
                <b>ท้ายฟอร์ม — Additional Information</b>
                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  {loose.map(f => (
                    <div key={f.id} className="flex between" style={{ alignItems: 'center', background: '#eef6ff', borderRadius: 8, padding: '6px 10px' }}>
                      <span style={{ fontSize: 13 }}><b>{f.label}</b> <span className="muted" style={{ fontSize: 11 }}>{f.field_key}{f.is_active ? '' : ' · ปิดใช้งาน'}</span></span>
                      <button className="btn btn-outline btn-sm" onClick={() => openForm(f)}>แก้ไข / ย้ายกลุ่ม</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th style={{ width: 70 }}>ลำดับ</th><th>Label</th><th>ประเภท</th><th>ตำแหน่ง</th><th>Required</th><th>แสดงในอีเมล</th><th>สถานะ</th><th>จัดการ</th></tr>
            </thead>
            <tbody>
              {fields.length ? fields.map((f, idx) => (
                <tr key={f.id}>
                  <td>
                    <button className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} disabled={idx === 0} onClick={() => move(idx, -1)}>&uarr;</button>{' '}
                    <button className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} disabled={idx === fields.length - 1} onClick={() => move(idx, 1)}>&darr;</button>
                  </td>
                  <td><b>{f.label}</b><br /><span className="muted" style={{ fontSize: 11 }}>{f.field_key}</span></td>
                  <td>{typeLabel(f.field_type)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{positionLabel(f.position_after)}</td>
                  <td>{f.is_required ? <span className="badge rejected">จำเป็น</span> : <span className="muted">ไม่บังคับ</span>}</td>
                  <td>{f.show_in_email ? <span className="badge approved">แสดง</span> : <span className="muted">ไม่แสดง</span>}</td>
                  <td><span className={`badge ${f.is_active ? 'approved' : 'cancelled'}`}>{f.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</span></td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => openForm(f)}>แก้ไข</button>{' '}
                    <button className="btn btn-outline btn-sm" onClick={() => toggleActive(f)}>{f.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => remove(f)}>ลบ</button>
                  </td>
                </tr>
              )) : <tr><td colSpan={8} className="empty">ยังไม่มี Field เพิ่มเติม — กด "+ Add Field" เพื่อเริ่มสร้าง</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setEditing(undefined); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>{editing ? 'แก้ไข Field' : 'เพิ่ม Field ใหม่'}</h3>
              <button className="modal-close" onClick={() => setEditing(undefined)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSubmit}>
                {!editing && (
                  <div className="form-group">
                    <label>รหัส Field (field_key) <span className="req">*</span></label>
                    <input value={form.field_key} onChange={set('field_key')} placeholder="เช่น project_number" required
                      pattern="^[a-z][a-z0-9_]*$" title="ตัวพิมพ์เล็ก a-z, 0-9, _ เท่านั้น และขึ้นต้นด้วยตัวอักษร" />
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>ใช้อ้างอิงในระบบ แก้ไขภายหลังไม่ได้ เช่น project_number, machine_type</div>
                  </div>
                )}
                <div className="form-group"><label>ชื่อหัวข้อ (Label) <span className="req">*</span></label><input value={form.label} onChange={set('label')} required /></div>
                <div className="form-group">
                  <label>ประเภท Field <span className="req">*</span></label>
                  <select value={form.field_type} onChange={set('field_type')} disabled={!!editing}>
                    {FIELD_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                  </select>
                  {editing && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>เปลี่ยนประเภทภายหลังไม่ได้ (ป้องกันข้อมูลเก่าตีความผิดรูปแบบ) — ถ้าต้องการเปลี่ยนประเภท แนะนำปิดใช้งาน Field นี้แล้วสร้างใหม่</div>}
                </div>
                {OPTION_TYPES.includes(form.field_type) && (
                  <div className="form-group">
                    <label>ตัวเลือก (1 บรรทัด = 1 ตัวเลือก) <span className="req">*</span></label>
                    <textarea rows={4} value={form.optionsText} onChange={set('optionsText')} placeholder={'ตัวเลือก 1\nตัวเลือก 2\nตัวเลือก 3'} required />
                  </div>
                )}
                <div className="form-group"><label>Placeholder</label><input value={form.placeholder} onChange={set('placeholder')} /></div>
                <div className="form-group">
                  <label>ตำแหน่งในฟอร์ม</label>
                  <select value={form.position_after} onChange={set('position_after')}>
                    <option value="">ท้ายฟอร์ม (ค่าเริ่มต้น)</option>
                    <option value="TOP">บนสุดของฟอร์ม</option>
                    <optgroup label="ท้ายกลุ่ม (แนะนำ — ตรงกับหัวข้อในฟอร์ม)">
                      {FORM_GROUPS.map(g => <option key={g.end} value={g.end}>{g.title} ({g.en})</option>)}
                    </optgroup>
                    <optgroup label="วางต่อจาก Field ที่มีอยู่">
                      {ESSENTIAL_FIELDS.map(f => <option key={f.field_key} value={f.field_key}>{f.label}</option>)}
                      {coreFields.map(f => <option key={f.field_key} value={f.field_key}>{f.label}</option>)}
                      {fields.filter(f => !editing || f.id !== editing.id).map(f => <option key={f.field_key} value={f.field_key}>{f.label} (Field ที่สร้างเอง)</option>)}
                    </optgroup>
                  </select>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>เลือกได้ว่าจะให้ Field นี้ไปโผล่ตรงไหนของฟอร์ม จะได้ไม่ต้องอยู่ท้ายฟอร์มเสมอไป</div>
                </div>
                <div className="form-group"><label>คำอธิบาย (Description)</label><input value={form.description} onChange={set('description')} /></div>
                <div className="form-group"><label>ค่าเริ่มต้น (Default Value)</label><input value={form.default_value} onChange={set('default_value')} /></div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                    <input type="checkbox" checked={form.is_required} onChange={set('is_required')} style={{ width: 'auto' }} /> จำเป็นต้องกรอก (Required)
                  </label>
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                    <input type="checkbox" checked={form.show_in_email} onChange={set('show_in_email')} style={{ width: 'auto' }} /> แสดงใน Email แจ้งเตือน
                  </label>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setEditing(undefined)}>ยกเลิก</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>บันทึก</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      <div className="flex between mb-16" style={{ marginTop: 28 }}>
        <div>
          <h3 style={{ margin: 0 }}>Field พื้นฐาน (จำเป็นต่อระบบ)</h3>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            Field กลุ่มนี้ต้อง<b>แสดงและบังคับกรอกเสมอ</b> (ผูกกับ logic หลักของระบบ) จึง<b>ซ่อน/ปิดบังคับกรอกไม่ได้</b> แต่แก้ <b>ชื่อหัวข้อ (Label)</b> ได้
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 28 }}>
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Label</th><th>สถานะ</th><th>จัดการ</th></tr>
            </thead>
            <tbody>
              {essentialLabels.map(f => (
                <tr key={f.field_key}>
                  <td><b>{f.label}</b><br /><span className="muted" style={{ fontSize: 11 }}>{f.field_key}</span></td>
                  <td><span className="badge approved">แสดงในฟอร์ม · จำเป็น</span></td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => openEssentialEdit(f)}>แก้ไข</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingEssential && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setEditingEssential(null); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>แก้ไขชื่อหัวข้อ: {editingEssential.field_key}</h3>
              <button className="modal-close" onClick={() => setEditingEssential(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={submitEssentialEdit}>
                <div className="form-group"><label>ชื่อหัวข้อ (Label) <span className="req">*</span></label>
                  <input value={essentialLabel} onChange={(e) => setEssentialLabel(e.target.value)} required />
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>
                  Field นี้ผูกกับ logic หลักของระบบ ต้องแสดงและบังคับกรอกเสมอ แก้ได้เฉพาะชื่อหัวข้อ
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setEditingEssential(null)}>ยกเลิก</button>
                  <button type="submit" className="btn btn-primary" disabled={savingEssential}>บันทึก</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="flex between mb-16" style={{ marginTop: 28 }}>
        <div>
          <h3 style={{ margin: 0 }}>Field เดิมของระบบ</h3>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            Field เหล่านี้ผูกกับข้อมูลเดิมในระบบ (PDF / Report) จึง<b>ลบไม่ได้</b> แต่สามารถ <b>ซ่อนจากฟอร์ม</b> <b>เปลี่ยนชื่อ</b> หรือ <b>จัดลำดับใหม่</b> ได้อย่างปลอดภัย<br />
            ข้อมูลเก่าที่เคยกรอกไว้จะไม่หายไปไหน ไม่ว่าจะปรับอะไรก็ตาม (Field พื้นฐานที่จำเป็น เช่น วันที่/ลูกค้า/เวลา จะอยู่บนสุดของฟอร์มเสมอ ไม่รวมอยู่ในรายการนี้)
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th style={{ width: 70 }}>ลำดับ</th><th>Label</th><th>Required</th><th>สถานะ</th><th>แสดงใน Email</th><th>จัดการ</th></tr>
            </thead>
            <tbody>
              {coreFields.map((f, idx) => (
                <tr key={f.field_key}>
                  <td>
                    <button className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} disabled={idx === 0} onClick={() => moveCore(idx, -1)}>&uarr;</button>{' '}
                    <button className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} disabled={idx === coreFields.length - 1} onClick={() => moveCore(idx, 1)}>&darr;</button>
                  </td>
                  <td><b>{f.label}</b><br /><span className="muted" style={{ fontSize: 11 }}>{f.field_key}</span></td>
                  <td>{f.is_required ? <span className="badge rejected">จำเป็น</span> : <span className="muted">ไม่บังคับ</span>}</td>
                  <td><span className={`badge ${f.is_visible ? 'approved' : 'cancelled'}`}>{f.is_visible ? 'แสดงในฟอร์ม' : 'ซ่อนอยู่'}</span></td>
                  <td>{f.field_key === 'purpose' ? <span className="muted" style={{ fontSize: 11 }}>ตั้งที่หน้า Email Settings</span> : <input type="checkbox" checked={!!f.show_in_email} onChange={() => toggleCoreEmail(f)} />}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => openCoreEdit(f)}>แก้ไข</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingCore && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setEditingCore(null); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>แก้ไข Field: {editingCore.field_key}</h3>
              <button className="modal-close" onClick={() => setEditingCore(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={submitCoreEdit}>
                <div className="form-group"><label>ชื่อหัวข้อ (Label) <span className="req">*</span></label><input value={coreForm.label} onChange={setCoreFormField('label')} required /></div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                    <input type="checkbox" checked={coreForm.is_visible} onChange={setCoreFormField('is_visible')} style={{ width: 'auto' }} /> แสดงในหน้า "สร้างคำขอ Visit"
                  </label>
                </div>
                {coreForm.is_visible && (
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                      <input type="checkbox" checked={coreForm.is_required} onChange={setCoreFormField('is_required')} style={{ width: 'auto' }} /> จำเป็นต้องกรอก (Required)
                    </label>
                  </div>
                )}
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>
                  Field นี้ผูกกับคอลัมน์จริงในฐานข้อมูล ไม่สามารถลบได้ถาวร เพื่อไม่ให้ PDF/Report เดิมพัง
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setEditingCore(null)}>ยกเลิก</button>
                  <button type="submit" className="btn btn-primary" disabled={savingCore}>บันทึก</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
