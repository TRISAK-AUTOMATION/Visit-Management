// client/src/pages/VisitRequest.jsx - เทียบเท่า public/visit-request.html
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { api, statusLabel } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const JOB_TYPES = ['เข้าพบลูกค้า', 'ติดตั้ง/บริการ', 'นำเสนอสินค้า', 'ติดตามงาน', 'ประชุมงาน', 'อื่นๆ'];
const TRANSPORTS = ['รถยนต์ส่วนตัว', 'รถบริษัท', 'รถสาธารณะ', 'แท็กซี่/แอปเรียกรถ', 'อื่นๆ'];

const emptyForm = {
  visit_date: new Date().toISOString().slice(0, 10),
  customer_id: '', time_from: '09:00', time_to: '16:00', job_type: JOB_TYPES[0], sales_person: '',
  purpose: '', location: '', contact_person: '', contact_phone: '', product: '', participants: '',
  transport: TRANSPORTS[0], license_plate: '', mileage_out: '', mileage_in: '', actual_time_out: '',
  actual_time_back: '', ot_hours: '', customer_tax_id: '', tax_invoice_date: '', notes: ''
};

export default function VisitRequest() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');

  const [form, setForm] = useState(emptyForm);
  const [editingRequest, setEditingRequest] = useState(null); // { id, status, code, approval_note }
  const [saving, setSaving] = useState(false);

  // Field เพิ่มเติมที่ Admin สร้างจาก Form Builder (Settings > Form Builder) - โหลดสดทุกครั้ง ไม่ hard-code
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [customValues, setCustomValues] = useState({});

  // การตั้งค่าซ่อน/แสดง/เปลี่ยนชื่อ ของ Field เดิมของระบบ (Settings > Form Builder > Field เดิมของระบบ)
  // ค่าเริ่มต้น = แสดงทุก field ด้วยชื่อเดิม (เหมือนพฤติกรรมก่อนมีฟีเจอร์นี้) กันหน้าตาสั่นระหว่างรอโหลด
  const DEFAULT_CORE_LABELS = {
    job_type: 'ประเภทงาน (Job Type)', sales_person: 'ผู้ดูแลการขาย (Sales)', location: 'สถานที่',
    contact_person: 'ผู้ติดต่อ', contact_phone: 'เบอร์โทร', product: 'สินค้า/อุปกรณ์ที่เกี่ยวข้อง',
    participants: 'ผู้ร่วมงาน', transport: 'ยานพาหนะ', license_plate: 'ทะเบียนรถ',
    mileage_out: 'ไมล์ออก', mileage_in: 'ไมล์เข้า', actual_time_out: 'เวลาออกจริง',
    actual_time_back: 'เวลากลับจริง', ot_hours: 'จำนวนชั่วโมง OT',
    customer_tax_id: 'เลขประจำตัวผู้เสียภาษีลูกค้า (Cus. TAX ID)', tax_invoice_date: 'วันที่ออกใบกำกับภาษี (TAX ID & Date)',
    notes: 'รายละเอียดเพิ่มเติม (Remark)'
  };
  const [coreSettings, setCoreSettings] = useState({});
  const cf = (key) => coreSettings[key] || { label: DEFAULT_CORE_LABELS[key], is_visible: true, is_required: false };

  // เรนเดอร์ field เดียวที่ Admin สร้างจาก Form Builder (ใช้ทั้งตอนวางไว้กลางฟอร์มและท้ายฟอร์ม)
  const renderCustomField = (f) => (
    <div key={f.id} className={`form-group ${['textarea', 'multiselect', 'radio'].includes(f.field_type) ? 'full' : ''}`}>
      <label>{f.label} {f.is_required && <span className="req">*</span>}</label>
      {f.description && <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>{f.description}</div>}

      {f.field_type === 'text' && (
        <input type="text" value={customValues[f.field_key] ?? f.default_value ?? ''} onChange={setCustom(f.field_key)} placeholder={f.placeholder} required={f.is_required} />
      )}
      {f.field_type === 'textarea' && (
        <textarea value={customValues[f.field_key] ?? f.default_value ?? ''} onChange={setCustom(f.field_key)} placeholder={f.placeholder} required={f.is_required} />
      )}
      {f.field_type === 'number' && (
        <input type="number" value={customValues[f.field_key] ?? f.default_value ?? ''} onChange={setCustom(f.field_key)} placeholder={f.placeholder} required={f.is_required} />
      )}
      {f.field_type === 'email' && (
        <input type="email" value={customValues[f.field_key] ?? f.default_value ?? ''} onChange={setCustom(f.field_key)} placeholder={f.placeholder} required={f.is_required} />
      )}
      {f.field_type === 'phone' && (
        <input type="tel" value={customValues[f.field_key] ?? f.default_value ?? ''} onChange={setCustom(f.field_key)} placeholder={f.placeholder} required={f.is_required} />
      )}
      {f.field_type === 'date' && (
        <input type="date" value={customValues[f.field_key] ?? f.default_value ?? ''} onChange={setCustom(f.field_key)} required={f.is_required} />
      )}
      {f.field_type === 'time' && (
        <input type="time" value={customValues[f.field_key] ?? f.default_value ?? ''} onChange={setCustom(f.field_key)} required={f.is_required} />
      )}
      {f.field_type === 'datetime' && (
        <input type="datetime-local" value={customValues[f.field_key] ?? f.default_value ?? ''} onChange={setCustom(f.field_key)} required={f.is_required} />
      )}
      {f.field_type === 'dropdown' && (
        <select value={customValues[f.field_key] ?? f.default_value ?? ''} onChange={setCustom(f.field_key)} required={f.is_required}>
          <option value="">-- เลือก --</option>
          {f.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {f.field_type === 'radio' && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
          {f.options.map(o => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
              <input type="radio" name={`custom_${f.field_key}`} value={o} style={{ width: 'auto' }}
                checked={customValues[f.field_key] === o} onChange={setCustom(f.field_key)} required={f.is_required} />
              {o}
            </label>
          ))}
        </div>
      )}
      {f.field_type === 'multiselect' && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
          {f.options.map(o => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
              <input type="checkbox" style={{ width: 'auto' }}
                checked={Array.isArray(customValues[f.field_key]) && customValues[f.field_key].includes(o)}
                onChange={toggleMultiselect(f.field_key, o)} />
              {o}
            </label>
          ))}
        </div>
      )}
      {f.field_type === 'checkbox' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={!!customValues[f.field_key]} onChange={setCustom(f.field_key)} /> ใช่ / ตกลง
        </label>
      )}
      {f.field_type === 'file' && (
        <>
          <input type="file" onChange={setCustomFile(f.field_key)} />
          {customValues[f.field_key] && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>แนบไฟล์แล้ว &#10003;</div>}
        </>
      )}
    </div>
  );

  // จัดกลุ่ม custom field ตามตำแหน่งที่ Admin เลือก (position_after): 'TOP' = บนสุด, '' = ท้ายฟอร์ม, หรือ field_key ใดๆ = วางต่อจาก field นั้น
  const customFieldsByAnchor = {};
  customFieldDefs.forEach(f => {
    const key = f.position_after || '';
    if (!customFieldsByAnchor[key]) customFieldsByAnchor[key] = [];
    customFieldsByAnchor[key].push(f);
  });
  const renderCustomFieldsAt = (anchorKey) => (customFieldsByAnchor[anchorKey] || []).map(renderCustomField);

  useEffect(() => {
    api.get('/api/form-fields').then(({ fields }) => setCustomFieldDefs(fields)).catch(() => {});
    api.get('/api/core-field-settings').then(({ settings }) => {
      const map = {};
      settings.forEach(s => { map[s.field_key] = s; });
      setCoreSettings(map);
    }).catch(() => {});
  }, []);

  const setCustom = (key) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setCustomValues(v => ({ ...v, [key]: val }));
  };

  const toggleMultiselect = (key, option) => (e) => {
    setCustomValues(v => {
      const cur = Array.isArray(v[key]) ? v[key] : [];
      const next = e.target.checked ? [...cur, option] : cur.filter(o => o !== option);
      return { ...v, [key]: next };
    });
  };

  const setCustomFile = (key) => (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast('ไฟล์ต้องมีขนาดไม่เกิน 4MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCustomValues(v => ({ ...v, [key]: reader.result }));
    reader.readAsDataURL(file);
  };

  // ค้นหาลูกค้าแบบพิมพ์แล้วค้นหา (รหัส/ชื่อลูกค้ามีนับพันรายการ โหลดทั้งหมดทีเดียวไม่ไหว)
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null); // { id, code, name, contact_person, tax_id, address }

  useEffect(() => {
    const q = customerQuery.trim();
    if (!q) { setCustomerResults([]); return; }
    const t = setTimeout(() => {
      api.get(`/api/customers?q=${encodeURIComponent(q)}`)
        .then(r => setCustomerResults(r.customers.slice(0, 20)))
        .catch(() => setCustomerResults([]));
    }, 250); // debounce กันยิง API ถี่เกินไปตอนพิมพ์
    return () => clearTimeout(t);
  }, [customerQuery]);

  const pickCustomer = (c) => {
    setSelectedCustomer(c);
    setCustomerQuery(`${c.code} - ${c.name}`);
    setCustomerOpen(false);
    setForm(f => ({
      ...f,
      customer_id: c.id,
      // auto-fill จากข้อมูลลูกค้า: ผู้ดูแลการขาย และเลขผู้เสียภาษี
      sales_person: c.contact_person || f.sales_person,
      customer_tax_id: c.tax_id || f.customer_tax_id
    }));
  };

  useEffect(() => {
    if (!editId) { setEditingRequest(null); setForm(emptyForm); setCustomValues({}); return; }
    api.get(`/api/visit-requests/${editId}`).then(({ request, customFields }) => {
      if (!['draft', 'revision'].includes(request.status)) {
        toast('ไม่สามารถแก้ไขคำขอนี้ได้แล้ว', 'error');
        navigate('/my-requests');
        return;
      }
      setEditingRequest(request);
      // แปลงค่า custom field ที่เคยบันทึกไว้กลับเป็น state ตามชนิด field (multiselect เก็บเป็น JSON array)
      const cv = {};
      (customFields || []).forEach(f => {
        if (f.field_type === 'multiselect') {
          try { cv[f.field_key] = JSON.parse(f.value || '[]'); } catch (e) { cv[f.field_key] = []; }
        } else if (f.field_type === 'checkbox') {
          cv[f.field_key] = f.value === 'true';
        } else {
          cv[f.field_key] = f.value || '';
        }
      });
      setCustomValues(cv);
      setForm({
        visit_date: request.visit_date || emptyForm.visit_date,
        customer_id: request.customer_id || '',
        time_from: request.time_from || '09:00',
        time_to: request.time_to || '16:00',
        job_type: request.job_type || JOB_TYPES[0],
        sales_person: request.sales_person || '',
        purpose: request.purpose || '',
        location: request.location || '',
        contact_person: request.contact_person || '',
        contact_phone: request.contact_phone || '',
        product: request.product || '',
        participants: request.participants || '',
        transport: request.transport || TRANSPORTS[0],
        license_plate: request.license_plate || '',
        mileage_out: request.mileage_out || '',
        mileage_in: request.mileage_in || '',
        actual_time_out: request.actual_time_out || '',
        actual_time_back: request.actual_time_back || '',
        ot_hours: request.ot_hours || '',
        customer_tax_id: request.customer_tax_id || '',
        tax_invoice_date: request.tax_invoice_date || '',
        notes: request.notes || ''
      });
      // โหลดชื่อลูกค้าที่เคยเลือกไว้มาแสดงในช่องค้นหา
      if (request.customer_id) {
        api.get(`/api/customers/${request.customer_id}`)
          .then(r => {
            setSelectedCustomer(r.customer);
            setCustomerQuery(`${r.customer.code} - ${r.customer.name}`);
          })
          .catch(() => {});
      }
    }).catch(err => toast(err.message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const buildPayload = () => ({
    ...form,
    mileage_out: form.mileage_out || null,
    mileage_in: form.mileage_in || null,
    ot_hours: form.ot_hours || null,
    custom_fields: customValues
  });

  // บันทึกฉบับร่าง (ไม่ตรวจสอบข้อมูลจำเป็นแบบเข้มงวด)
  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      if (editingRequest) {
        await api.put(`/api/visit-requests/${editingRequest.id}`, buildPayload());
        toast('บันทึกฉบับร่างสำเร็จ', 'success');
      } else {
        const r = await api.post('/api/visit-requests', { ...buildPayload(), save_as: 'draft' });
        toast(`บันทึกฉบับร่างสำเร็จ (${r.code})`, 'success');
      }
      setTimeout(() => navigate('/my-requests'), 600);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ส่งคำขอเข้าสู่ระบบอนุมัติ
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.customer_id) {
      toast('กรุณาเลือกลูกค้าจากรายการค้นหาก่อนส่งคำขอ', 'error');
      return;
    }
    const missingCustom = customFieldDefs.filter(f => {
      if (!f.is_required) return false;
      const v = customValues[f.field_key];
      return v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
    });
    if (missingCustom.length) {
      toast(`กรุณากรอก: ${missingCustom.map(f => f.label).join(', ')}`, 'error');
      return;
    }
    const missingCore = Object.values(coreSettings).filter(s => {
      if (!s.is_visible || !s.is_required) return false;
      const v = form[s.field_key];
      return v === undefined || v === null || !String(v).trim();
    });
    if (missingCore.length) {
      toast(`กรุณากรอก: ${missingCore.map(f => f.label).join(', ')}`, 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingRequest) {
        await api.put(`/api/visit-requests/${editingRequest.id}`, buildPayload());
        await api.post(`/api/visit-requests/${editingRequest.id}/submit`);
        toast(`ส่งคำขอสำเร็จ (${editingRequest.code})`, 'success');
      } else {
        const r = await api.post('/api/visit-requests', buildPayload());
        toast(`ส่งคำขอสำเร็จ (${r.code})`, 'success');
      }
      setTimeout(() => navigate('/my-requests'), 800);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout title={editingRequest ? `แก้ไขคำขอ #${editingRequest.code}` : 'สร้างคำขอออกนอกสถานที่ (Visit Request)'}>
      <div className="card" style={{ maxWidth: 900 }}>
        <div className="card-head">
          <h3>ข้อมูลคำขอ</h3>
          {editingRequest && <span className={`badge ${editingRequest.status}`}>{statusLabel(editingRequest.status)}</span>}
        </div>
        <div className="card-body">
          {editingRequest && editingRequest.status === 'revision' && editingRequest.approval_note && (
            <div style={{ background: '#ffe9d1', color: '#c9670f', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              <b>ผู้อนุมัติขอให้แก้ไข:</b> {editingRequest.approval_note}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            {renderCustomFieldsAt('TOP').length > 0 && (
              <>
                <h3 style={{ marginTop: 0 }}>ข้อมูลเพิ่มเติม (บนสุด)</h3>
                <div className="form-grid" style={{ marginBottom: 20 }}>{renderCustomFieldsAt('TOP')}</div>
              </>
            )}
            <div className="form-grid">
              <div className="form-group">
                <label>วันที่ <span className="req">*</span></label>
                <input type="date" value={form.visit_date} onChange={set('visit_date')} required />
              </div>
              {renderCustomFieldsAt('visit_date')}
              <div className="form-group" style={{ position: 'relative' }}>
                <label>รหัสลูกค้า / บริษัท <span className="req">*</span></label>
                <input
                  type="text"
                  value={customerQuery}
                  placeholder="พิมพ์รหัสลูกค้าหรือชื่อบริษัทเพื่อค้นหา"
                  onChange={(e) => {
                    setCustomerQuery(e.target.value);
                    setCustomerOpen(true);
                    if (selectedCustomer) {
                      setSelectedCustomer(null);
                      setForm(f => ({ ...f, customer_id: '' }));
                    }
                  }}
                  onFocus={() => setCustomerOpen(true)}
                  onBlur={() => setTimeout(() => setCustomerOpen(false), 150)}
                  autoComplete="off"
                  required
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
                        {c.contact_person && <div style={{ color: '#888' }}>Sales: {c.contact_person}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {renderCustomFieldsAt('customer_id')}
              <div className="form-group">
                <label>เวลาเริ่ม (แผน) <span className="req">*</span></label>
                <input type="time" value={form.time_from} onChange={set('time_from')} required />
              </div>
              {renderCustomFieldsAt('time_from')}
              <div className="form-group">
                <label>เวลาสิ้นสุด (แผน) <span className="req">*</span></label>
                <input type="time" value={form.time_to} onChange={set('time_to')} required />
              </div>
              {renderCustomFieldsAt('time_to')}
              {cf('job_type').is_visible && (
                <div className="form-group">
                  <label>{cf('job_type').label} {cf('job_type').is_required && <span className="req">*</span>}</label>
                  <select value={form.job_type} onChange={set('job_type')} required={cf('job_type').is_required}>
                    {JOB_TYPES.map(j => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
              )}
              {renderCustomFieldsAt('job_type')}
              {cf('sales_person').is_visible && (
                <div className="form-group">
                  <label>{cf('sales_person').label} {cf('sales_person').is_required && <span className="req">*</span>}</label>
                  <input type="text" value={form.sales_person} onChange={set('sales_person')} placeholder="ปล่อยว่างหากเป็นผู้ขอเอง" required={cf('sales_person').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('sales_person')}
              <div className="form-group full">
                <label>วัตถุประสงค์ / รายละเอียดงาน <span className="req">*</span></label>
                <input type="text" value={form.purpose} onChange={set('purpose')} placeholder="เช่น เข้าพบลูกค้า เพื่อนำเสนอสินค้าและบริการ" required />
              </div>
              {renderCustomFieldsAt('purpose')}
              {cf('location').is_visible && (
                <div className="form-group full">
                  <label>{cf('location').label} {cf('location').is_required && <span className="req">*</span>}</label>
                  <input type="text" value={form.location} onChange={set('location')} placeholder="ที่อยู่ปลายทาง" required={cf('location').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('location')}
              {cf('contact_person').is_visible && (
                <div className="form-group">
                  <label>{cf('contact_person').label} {cf('contact_person').is_required && <span className="req">*</span>}</label>
                  <input type="text" value={form.contact_person} onChange={set('contact_person')} placeholder="ชื่อผู้ติดต่อฝั่งลูกค้า" required={cf('contact_person').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('contact_person')}
              {cf('contact_phone').is_visible && (
                <div className="form-group">
                  <label>{cf('contact_phone').label} {cf('contact_phone').is_required && <span className="req">*</span>}</label>
                  <input type="text" value={form.contact_phone} onChange={set('contact_phone')} placeholder="0xx-xxx-xxxx" required={cf('contact_phone').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('contact_phone')}
              {cf('product').is_visible && (
                <div className="form-group">
                  <label>{cf('product').label} {cf('product').is_required && <span className="req">*</span>}</label>
                  <input type="text" value={form.product} onChange={set('product')} placeholder="เช่น เครื่องจักร, อะไหล่, ซอฟต์แวร์" required={cf('product').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('product')}
              {cf('participants').is_visible && (
                <div className="form-group">
                  <label>{cf('participants').label} {cf('participants').is_required && <span className="req">*</span>}</label>
                  <input type="text" value={form.participants} onChange={set('participants')} placeholder="ชื่อเพื่อนร่วมทีม (ถ้ามี)" required={cf('participants').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('participants')}
              {cf('transport').is_visible && (
                <div className="form-group">
                  <label>{cf('transport').label} {cf('transport').is_required && <span className="req">*</span>}</label>
                  <select value={form.transport} onChange={set('transport')} required={cf('transport').is_required}>
                    {TRANSPORTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
              {renderCustomFieldsAt('transport')}
              {cf('license_plate').is_visible && (
                <div className="form-group">
                  <label>{cf('license_plate').label} {cf('license_plate').is_required && <span className="req">*</span>}</label>
                  <input type="text" value={form.license_plate} onChange={set('license_plate')} placeholder="กข 1234" required={cf('license_plate').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('license_plate')}
              {cf('mileage_out').is_visible && (
                <div className="form-group">
                  <label>{cf('mileage_out').label} {cf('mileage_out').is_required && <span className="req">*</span>}</label>
                  <input type="number" value={form.mileage_out} onChange={set('mileage_out')} placeholder="เลขไมล์ตอนออกเดินทาง" required={cf('mileage_out').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('mileage_out')}
              {cf('mileage_in').is_visible && (
                <div className="form-group">
                  <label>{cf('mileage_in').label} {cf('mileage_in').is_required && <span className="req">*</span>}</label>
                  <input type="number" value={form.mileage_in} onChange={set('mileage_in')} placeholder="เลขไมล์ตอนกลับถึง" required={cf('mileage_in').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('mileage_in')}
              {cf('actual_time_out').is_visible && (
                <div className="form-group">
                  <label>{cf('actual_time_out').label} {cf('actual_time_out').is_required && <span className="req">*</span>}</label>
                  <input type="time" value={form.actual_time_out} onChange={set('actual_time_out')} required={cf('actual_time_out').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('actual_time_out')}
              {cf('actual_time_back').is_visible && (
                <div className="form-group">
                  <label>{cf('actual_time_back').label} {cf('actual_time_back').is_required && <span className="req">*</span>}</label>
                  <input type="time" value={form.actual_time_back} onChange={set('actual_time_back')} required={cf('actual_time_back').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('actual_time_back')}
              {cf('ot_hours').is_visible && (
                <div className="form-group">
                  <label>{cf('ot_hours').label} {cf('ot_hours').is_required && <span className="req">*</span>}</label>
                  <input type="number" step="0.5" value={form.ot_hours} onChange={set('ot_hours')} placeholder="เช่น 1.5" required={cf('ot_hours').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('ot_hours')}
              {cf('customer_tax_id').is_visible && (
                <div className="form-group">
                  <label>{cf('customer_tax_id').label} {cf('customer_tax_id').is_required && <span className="req">*</span>}</label>
                  <input type="text" value={form.customer_tax_id} onChange={set('customer_tax_id')} placeholder="0-XXXX-XXXXX-XX-X" required={cf('customer_tax_id').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('customer_tax_id')}
              {cf('tax_invoice_date').is_visible && (
                <div className="form-group full">
                  <label>{cf('tax_invoice_date').label} {cf('tax_invoice_date').is_required && <span className="req">*</span>}</label>
                  <input type="date" value={form.tax_invoice_date} onChange={set('tax_invoice_date')} required={cf('tax_invoice_date').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('tax_invoice_date')}
              {cf('notes').is_visible && (
                <div className="form-group full">
                  <label>{cf('notes').label} {cf('notes').is_required && <span className="req">*</span>}</label>
                  <textarea value={form.notes} onChange={set('notes')} placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)" required={cf('notes').is_required} />
                </div>
              )}
              {renderCustomFieldsAt('notes')}
            </div>

            {renderCustomFieldsAt('').length > 0 && (
              <>
                <h3 style={{ marginTop: 24 }}>ข้อมูลเพิ่มเติม</h3>
                <div className="form-grid">{renderCustomFieldsAt('')}</div>
              </>
            )}

            <div className="form-actions">
              <button type="button" className="btn btn-outline" onClick={() => navigate('/my-requests')}>ยกเลิก</button>
              {(!editingRequest || editingRequest.status === 'draft') && (
                <button type="button" className="btn btn-outline" disabled={saving} onClick={handleSaveDraft}>บันทึกฉบับร่าง</button>
              )}
              <button type="submit" className="btn btn-primary" disabled={saving}>ส่งคำขอ</button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
