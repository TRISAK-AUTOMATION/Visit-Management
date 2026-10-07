// client/src/pages/VisitRequest.jsx - เทียบเท่า public/visit-request.html
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import TimeInput24 from '../components/TimeInput24';
import { api, statusLabel, todayLocal } from '../lib/api';
import { useToast } from '../lib/ToastContext';

// checkbox/radio: รีเซ็ตสไตล์ของกฎ `.form-group input` (กว้างเต็มแถว + padding) แบบ inline เพื่อไม่ขึ้นกับ CSS ไฟล์อื่น/cache
const CHECK_STYLE = { width: 16, height: 16, padding: 0, margin: 0, flex: '0 0 auto' };

const JOB_TYPES = ['เข้าพบลูกค้า', 'ติดตั้ง/บริการ', 'นำเสนอสินค้า', 'ติดตามงาน', 'ประชุมงาน', 'อื่นๆ'];
const TRANSPORTS = ['รถยนต์ส่วนตัว', 'รถบริษัท', 'รถสาธารณะ', 'แท็กซี่/แอปเรียกรถ', 'อื่นๆ'];

const emptyForm = {
  visit_date: todayLocal(),
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

  // รายชื่อพนักงานแผนก Engineer สำหรับให้เลือกเป็น "ผู้ร่วมงาน" (จำกัดเฉพาะแผนกนี้ตามที่ขอ)
  const [engineerUsers, setEngineerUsers] = useState([]);
  useEffect(() => {
    api.get('/api/users/by-department/Engineer').then(({ users }) => setEngineerUsers(users)).catch(() => {});
  }, []);

  // ช่องผู้ร่วมงาน: ค้นหาชื่อ + ตัวเลือก "รวมแผนกอื่น" (โหลดรายชื่อทุกแผนกเมื่อกดเปิดเท่านั้น)
  const [participantSearch, setParticipantSearch] = useState('');
  const [includeOtherDepts, setIncludeOtherDepts] = useState(false);
  const [allUsers, setAllUsers] = useState(null);
  useEffect(() => {
    if (includeOtherDepts && allUsers === null) {
      api.get('/api/users/directory').then(({ users }) => setAllUsers(users)).catch(() => setAllUsers([]));
    }
  }, [includeOtherDepts, allUsers]);

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

  // Label ของ Field พื้นฐานที่จำเป็นต่อระบบ (วันที่/ลูกค้า/เวลา/วัตถุประสงค์) - Admin แก้ได้จาก Form Builder
  // ต่างจาก coreSettings ตรงที่ field กลุ่มนี้แสดง+บังคับกรอกเสมอ ปรับได้แค่ชื่อหัวข้อ
  const DEFAULT_ESSENTIAL_LABELS = {
    visit_date: 'วันที่', customer_id: 'รหัสลูกค้า / บริษัท',
    time_from: 'เวลาเริ่ม (แผน)', time_to: 'เวลาสิ้นสุด (แผน)', purpose: 'วัตถุประสงค์ / รายละเอียดงาน'
  };
  const [essentialLabels, setEssentialLabels] = useState({});
  const el = (key) => essentialLabels[key] || DEFAULT_ESSENTIAL_LABELS[key];

  // ลำดับ Field เดิมที่เคย hard-code ไว้แต่แรก ใช้เป็น fallback ระหว่างรอโหลดค่าจาก backend เท่านั้น
  const DEFAULT_CORE_ORDER = ['job_type', 'sales_person', 'location', 'contact_person', 'contact_phone', 'product',
    'participants', 'transport', 'license_plate', 'mileage_out', 'mileage_in', 'actual_time_out', 'actual_time_back',
    'ot_hours', 'customer_tax_id', 'tax_invoice_date', 'notes'];

  // สเปกวิธี render ของแต่ละ Field เดิม (ชนิด input / placeholder / ตัวเลือก) — ลำดับการแสดงผลจริงมาจาก coreSettings.sort_order ไม่ใช่ลำดับในนี้
  const CORE_FIELD_INPUT = {
    job_type: { type: 'select', options: JOB_TYPES },
    sales_person: { type: 'text', placeholder: 'ปล่อยว่างหากเป็นผู้ขอเอง' },
    location: { type: 'text', placeholder: 'ที่อยู่ปลายทาง', full: true },
    contact_person: { type: 'text', placeholder: 'ชื่อผู้ติดต่อฝั่งลูกค้า' },
    contact_phone: { type: 'text', placeholder: '0xx-xxx-xxxx' },
    product: { type: 'text', placeholder: 'เช่น เครื่องจักร, อะไหล่, ซอฟต์แวร์' },
    participants: { type: 'engineer_multiselect', placeholder: 'เลือกผู้ร่วมงาน' },
    transport: { type: 'select', options: TRANSPORTS },
    license_plate: { type: 'text', placeholder: 'กข 1234' },
    mileage_out: { type: 'number', placeholder: 'เลขไมล์ตอนออกเดินทาง' },
    mileage_in: { type: 'number', placeholder: 'เลขไมล์ตอนกลับถึง' },
    actual_time_out: { type: 'time' },
    actual_time_back: { type: 'time' },
    ot_hours: { type: 'number', step: '0.5', placeholder: 'เช่น 1.5' },
    customer_tax_id: { type: 'text', placeholder: '0-XXXX-XXXXX-XX-X' },
    tax_invoice_date: { type: 'date', full: true },
    notes: { type: 'textarea', placeholder: 'หมายเหตุเพิ่มเติม (ถ้ามี)', full: true }
  };

  // เรนเดอร์ Field เดิม 1 ตัว ตามชนิด input ที่กำหนดไว้ + ใช้ label/required/visible จาก coreSettings (Admin ปรับได้จากหลังบ้าน)
  const renderCoreField = (key) => {
    const setting = cf(key);
    if (!setting.is_visible) return null;
    const spec = CORE_FIELD_INPUT[key];
    if (!spec) return null;
    return (
      <div key={key} className={`form-group ${spec.full ? 'full' : ''}`}>
        <label>{setting.label} {setting.is_required && <span className="req">*</span>}</label>
        {spec.type === 'select' && (
          <select value={form[key]} onChange={set(key)} required={setting.is_required}>
            {spec.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {spec.type === 'text' && (
          <input type="text" value={form[key]} onChange={set(key)} placeholder={spec.placeholder} required={setting.is_required} />
        )}
        {spec.type === 'number' && (
          <input type="number" step={spec.step} value={form[key]} onChange={set(key)} placeholder={spec.placeholder} required={setting.is_required} />
        )}
        {spec.type === 'time' && (
          <TimeInput24 value={form[key]} onChange={set(key)} required={setting.is_required} />
        )}
        {spec.type === 'date' && (
          <input type="date" value={form[key]} onChange={set(key)} required={setting.is_required} />
        )}
        {spec.type === 'textarea' && (
          <textarea value={form[key]} onChange={set(key)} placeholder={spec.placeholder} required={setting.is_required} />
        )}
        {spec.type === 'engineer_multiselect' && (() => {
          const selected = form[key] ? form[key].split(',').map(s => s.trim()).filter(Boolean) : [];
          const toggle = (name) => {
            const next = selected.includes(name) ? selected.filter(n => n !== name) : [...selected, name];
            setForm(f => ({ ...f, [key]: next.join(', ') }));
          };
          // ค่าเริ่มต้น = เฉพาะ Engineer | เปิด "รวมแผนกอื่น" = ทุกแผนก (Engineer ขึ้นก่อน)
          const pool = includeOtherDepts
            ? (allUsers || []).map(u => ({ id: u.id, full_name: u.full_name, dept: u.department }))
                .sort((a, b) => (a.dept === 'Engineer' ? 0 : 1) - (b.dept === 'Engineer' ? 0 : 1) || a.full_name.localeCompare(b.full_name))
            : engineerUsers.map(u => ({ id: u.id, full_name: u.full_name, dept: 'Engineer' }));
          const q = participantSearch.trim().toLowerCase();
          const shown = q ? pool.filter(u => u.full_name.toLowerCase().includes(q)) : pool;
          // พิมพ์ชื่อเองได้ (เช่น คนนอกบริษัท/ไม่มีในระบบ) - ตัดเครื่องหมาย , ออก เพราะระบบเก็บรายชื่อแบบคั่นด้วย ,
          const typedName = participantSearch.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
          const canAddTyped = typedName && !selected.some(n => n.toLowerCase() === typedName.toLowerCase());
          const addTyped = () => {
            if (!canAddTyped) return;
            setForm(f => ({ ...f, [key]: [...selected, typedName].join(', ') }));
            setParticipantSearch('');
          };
          return (
            <div>
              {selected.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {selected.map(name => (
                    <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#e7edff', color: 'var(--blue-600)', borderRadius: 999, padding: '3px 6px 3px 10px', fontSize: 12.5, fontWeight: 600 }}>
                      {name}
                      <button type="button" onClick={() => toggle(name)} aria-label={`เอา ${name} ออก`}
                        style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' }}>&times;</button>
                    </span>
                  ))}
                </div>
              )}
              <input type="text" value={participantSearch} onChange={e => setParticipantSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!shown.length) addTyped(); } }}
                placeholder="ค้นหาชื่อ หรือพิมพ์ชื่อเอง..." style={{ marginBottom: 6 }} />
              <div style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '6px 10px', maxHeight: 150, overflowY: 'auto' }}>
                {shown.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', columnGap: 10 }}>
                    {shown.map(u => (
                      <label key={u.id} title={u.dept && u.dept !== 'Engineer' ? `${u.full_name} (${u.dept})` : u.full_name}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer', minWidth: 0 }}>
                        <input type="checkbox" style={CHECK_STYLE} checked={selected.includes(u.full_name)} onChange={() => toggle(u.full_name)} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.full_name}
                          {includeOtherDepts && u.dept && u.dept !== 'Engineer' ? <span className="muted" style={{ fontSize: 11 }}> · {u.dept}</span> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {includeOtherDepts && allUsers === null ? 'กำลังโหลดรายชื่อ...' : q ? 'ไม่พบชื่อที่ค้นหา' : 'ยังไม่มีพนักงานในแผนก Engineer'}
                  </div>
                )}
              </div>
              {canAddTyped && (
                <button type="button" onClick={addTyped}
                  style={{ display: 'block', marginTop: 6, background: 'none', border: 'none', padding: 0, color: 'var(--blue-600)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                  + เพิ่ม "{typedName}" เป็นผู้ร่วมงาน (พิมพ์เอง)
                </button>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 0, fontSize: 12.5, fontWeight: 400, cursor: 'pointer' }}>
                <input type="checkbox" style={CHECK_STYLE} checked={includeOtherDepts} onChange={e => setIncludeOtherDepts(e.target.checked)} />
                รวมพนักงานแผนกอื่นด้วย
              </label>
            </div>
          );
        })()}
      </div>
    );
  };

  // ลำดับ Field เดิมจริงที่จะ render มาจาก sort_order ที่ Admin จัดไว้ (เรียงตาม backend เสมอเมื่อโหลดเสร็จ)
  const orderedCoreKeys = Object.keys(coreSettings).length
    ? Object.values(coreSettings).sort((a, b) => a.sort_order - b.sort_order).map(s => s.field_key)
    : DEFAULT_CORE_ORDER;

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
        <TimeInput24 value={customValues[f.field_key] ?? f.default_value ?? ''} onChange={setCustom(f.field_key)} required={f.is_required} />
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
              <input type="radio" name={`custom_${f.field_key}`} value={o} style={CHECK_STYLE}
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
              <input type="checkbox" style={CHECK_STYLE}
                checked={Array.isArray(customValues[f.field_key]) && customValues[f.field_key].includes(o)}
                onChange={toggleMultiselect(f.field_key, o)} />
              {o}
            </label>
          ))}
        </div>
      )}
      {f.field_type === 'checkbox' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
          <input type="checkbox" style={CHECK_STYLE} checked={!!customValues[f.field_key]} onChange={setCustom(f.field_key)} /> ใช่ / ตกลง
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
    api.get('/api/core-field-settings/essential-labels').then(({ labels }) => {
      const map = {};
      labels.forEach(l => { map[l.field_key] = l.label; });
      setEssentialLabels(map);
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

  // เพิ่มลูกค้าใหม่ (รอตรวจสอบ) กรณีไป Visit ที่ยังไม่อยู่ในฐานข้อมูลลูกค้า - Admin จะตรวจสอบ/ใส่รหัสจริง/รวมเข้ากับลูกค้าเดิมภายหลัง
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', contact_person: '', phone: '', tax_id: '' });
  const [savingNewCust, setSavingNewCust] = useState(false);

  const openNewCustomer = () => {
    setNewCust({ name: customerQuery.trim(), contact_person: '', phone: '', tax_id: '' });
    setCustomerOpen(false);
    setNewCustOpen(true);
  };

  const createPendingCustomer = async () => {
    if (!newCust.name.trim()) { toast('กรุณากรอกชื่อลูกค้า/บริษัท', 'error'); return; }
    setSavingNewCust(true);
    try {
      const { customer } = await api.post('/api/customers/pending', newCust);
      pickCustomer(customer);
      setNewCustOpen(false);
      toast(`เพิ่มลูกค้าใหม่แล้ว (${customer.code}) รอผู้ดูแลระบบตรวจสอบ`, 'success');
    } catch (err) {
      if (err.status === 409 && err.data && err.data.duplicate) {
        // มีลูกค้าชื่อเดียวกันอยู่แล้ว -> ใช้รายเดิมแทนการสร้างซ้ำ
        pickCustomer(err.data.duplicate);
        setNewCustOpen(false);
        toast('มีลูกค้าชื่อนี้อยู่ในระบบแล้ว ระบบเลือกรายเดิมให้แล้ว', 'success');
      } else {
        toast(err.message, 'error');
      }
    } finally {
      setSavingNewCust(false);
    }
  };

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
      // 'approved' = โหมด "อัปเดตข้อมูลหลังปฏิบัติงาน" (แก้ไขได้ทุก field แต่ไม่ต้องขออนุมัติซ้ำ)
      if (!['draft', 'revision', 'approved'].includes(request.status)) {
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

  // โหมด "อัปเดตข้อมูลหลังปฏิบัติงาน": คำขอนี้อนุมัติแล้ว แก้ไขได้ทุก field แต่บันทึกแล้วจบเลย ไม่ต้องขออนุมัติซ้ำ
  const isPostVisitUpdate = editingRequest && editingRequest.status === 'approved';

  const handlePostVisitSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/api/visit-requests/${editingRequest.id}`, buildPayload());
      toast(`บันทึกข้อมูลหลังปฏิบัติงานสำเร็จ (${editingRequest.code})`, 'success');
      setTimeout(() => navigate('/my-requests'), 600);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ส่งคำขอเข้าสู่ระบบอนุมัติ
  const handleSubmit = async (e) => {
    if (isPostVisitUpdate) return handlePostVisitSave(e);
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
    <Layout title={editingRequest ? (isPostVisitUpdate ? `อัปเดตข้อมูลหลังปฏิบัติงาน #${editingRequest.code}` : `แก้ไขคำขอ #${editingRequest.code}`) : 'สร้างคำขอออกนอกสถานที่ (Visit Request)'}>
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
          {isPostVisitUpdate && (
            <div style={{ background: '#e6f4ea', color: '#1a7a3c', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              คำขอนี้อนุมัติแล้ว — แก้ไขข้อมูลให้ตรงกับที่ปฏิบัติงานจริงได้ทุกช่อง แล้วกด "บันทึกข้อมูล" ได้เลย ไม่ต้องขออนุมัติใหม่อีกครั้ง
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
                <label>{el('visit_date')} <span className="req">*</span></label>
                <input type="date" value={form.visit_date} onChange={set('visit_date')} required />
              </div>
              {renderCustomFieldsAt('visit_date')}
              <div className="form-group" style={{ position: 'relative' }}>
                <label>{el('customer_id')} <span className="req">*</span></label>
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
                  <div style={{ fontSize: 12, color: '#c0392b', marginTop: 4 }}>
                    กรุณาเลือกลูกค้าจากรายการค้นหา{' '}
                    <button type="button" onClick={openNewCustomer}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--blue-600)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                      ไม่พบลูกค้า? + เพิ่มลูกค้าใหม่
                    </button>
                  </div>
                )}
                {selectedCustomer && selectedCustomer.is_pending ? (
                  <div style={{ fontSize: 12, color: '#c9861a', marginTop: 4 }}>ลูกค้าใหม่ — รอผู้ดูแลระบบตรวจสอบ ({selectedCustomer.code})</div>
                ) : null}
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
                        <div style={{ fontWeight: 600 }}>{c.code} — {c.name}{c.is_pending ? <span style={{ marginLeft: 6, fontSize: 11, color: '#c9861a', fontWeight: 500 }}>(ใหม่ · รอตรวจสอบ)</span> : null}</div>
                        {c.contact_person && <div style={{ color: '#888' }}>Sales: {c.contact_person}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {renderCustomFieldsAt('customer_id')}
              <div className="form-group">
                <label>{el('time_from')} <span className="req">*</span></label>
                <TimeInput24 value={form.time_from} onChange={set('time_from')} required />
              </div>
              {renderCustomFieldsAt('time_from')}
              <div className="form-group">
                <label>{el('time_to')} <span className="req">*</span></label>
                <TimeInput24 value={form.time_to} onChange={set('time_to')} required />
              </div>
              {renderCustomFieldsAt('time_to')}
              <div className="form-group full">
                <label>{el('purpose')} <span className="req">*</span></label>
                <input type="text" value={form.purpose} onChange={set('purpose')} placeholder="เช่น เข้าพบลูกค้า เพื่อนำเสนอสินค้าและบริการ" required />
              </div>
              {renderCustomFieldsAt('purpose')}
              {orderedCoreKeys.map(key => (
                <React.Fragment key={key}>
                  {renderCoreField(key)}
                  {renderCustomFieldsAt(key)}
                </React.Fragment>
              ))}
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
              <button type="submit" className="btn btn-primary" disabled={saving}>{isPostVisitUpdate ? 'บันทึกข้อมูล' : 'ส่งคำขอ'}</button>
            </div>
          </form>
        </div>
      </div>

      {newCustOpen && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setNewCustOpen(false); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>เพิ่มลูกค้าใหม่</h3>
              <button type="button" className="modal-close" onClick={() => setNewCustOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                ใช้เมื่อไป Visit ลูกค้าที่ยังไม่อยู่ในระบบ ระบบจะสร้างรหัสชั่วคราว (NEW-xxxx) และเลือกให้ในคำขอทันที โดยผู้ดูแลระบบจะตรวจสอบและใส่รหัสจริงภายหลัง
              </p>
              <div className="form-group">
                <label>ชื่อลูกค้า / บริษัท <span className="req">*</span></label>
                <input type="text" value={newCust.name} onChange={e => setNewCust(c => ({ ...c, name: e.target.value }))} autoFocus />
              </div>
              <div className="form-group">
                <label>ผู้ติดต่อ</label>
                <input type="text" value={newCust.contact_person} onChange={e => setNewCust(c => ({ ...c, contact_person: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>เบอร์โทร</label>
                <input type="text" value={newCust.phone} onChange={e => setNewCust(c => ({ ...c, phone: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>เลขประจำตัวผู้เสียภาษี</label>
                <input type="text" value={newCust.tax_id} onChange={e => setNewCust(c => ({ ...c, tax_id: e.target.value }))} placeholder="ถ้าทราบ" />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => setNewCustOpen(false)}>ยกเลิก</button>
                <button type="button" className="btn btn-primary" disabled={savingNewCust} onClick={createPendingCustomer}>
                  {savingNewCust ? 'กำลังบันทึก...' : 'เพิ่มและเลือกลูกค้านี้'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
