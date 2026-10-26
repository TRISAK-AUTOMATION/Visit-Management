// client/src/pages/VisitRequest.jsx
// ฟอร์ม Visit Request แบบ Single Page: Sticky Left Navigation + Accordion Sections + Sticky Footer Action Bar
// - ฟิลด์เดิมทั้งหมด + การตั้งค่า Form Builder (ซ่อน/แสดง/บังคับ/เปลี่ยนชื่อ, Custom Field) ยังทำงานเหมือนเดิม
// - ข้อมูลส่วนใหม่เก็บใน contacts_json / objective_json / during_visit_json / opportunity_json /
//   action_plan_json / customer_level_json / next_visit_json (backend รองรับแล้วใน routes/visitRequests.js)
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import TimeInput24 from '../components/TimeInput24';
import {
  Section, SubAccordion, Group, Field, CheckGroup, PillRadio, RadioCards, MultiPicker, DeptParticipants
} from '../components/VisitFormKit';
import { api, todayLocal } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { useAuth } from '../lib/AuthContext';
import './visit-form.css';

// ---------------------------------------------------------------- ค่าคงที่
const JOB_TYPES = ['เข้าพบลูกค้า', 'ติดตั้ง/บริการ', 'นำเสนอสินค้า', 'ติดตามงาน', 'ประชุมงาน', 'อื่นๆ'];
const TRANSPORTS = ['รถยนต์ส่วนตัว', 'รถบริษัท', 'รถสาธารณะ', 'แท็กซี่/แอปเรียกรถ', 'อื่นๆ'];
const COMPANIES = ['TAC', 'FAC', 'HTC'];

const OBJECTIVES = ['Part Opportunity', 'Product Expansion', 'Design-in', 'Replacement / Upgrade', 'Project Opportunity',
  'Application Information', 'Customer / Market Information', 'Other'];
const PROBLEMS = ['Downtime', 'Productivity', 'Quality', 'Manpower', 'Maintenance', 'Safety', 'Energy', 'Obsolete Equipment', 'Other', 'No Current Problem'];
const PROJECTS = ['New Machine', 'New Production Line', 'Factory Expansion', 'Automation', 'Replacement / Upgrade', 'Digitalization', 'Other', 'No Known Project'];
const TIMINGS = ['Less than 3 Months', '3–6 Months', '6–12 Months', 'More than 12 Months', 'Unknown'];
const POTENTIALS = ['Sensor', 'PLC', 'HMI', 'Inverter', 'Servo', 'Motion Control', 'Robot', 'Control Panel', 'Automation', 'Other'];
const FOUND = ['Part Opportunity', 'Product Expansion', 'Design-in', 'Replacement / Upgrade', 'Project Opportunity', 'No Opportunity'];
const ACTIONS = ['Send Product Information', 'Technical Discussion', 'Site Survey', 'Demo / Test', 'Product Selection',
  'Budgetary Quotation', 'Quotation', 'Project Proposal', 'Follow-up', 'No Action'];

const OPP_LEVELS = [
  { value: 'High', label: 'High', color: '#e5483e', tint: '#fff1f0', desc: 'โอกาสสูง ควรติดตามอย่างใกล้ชิด' },
  { value: 'Medium', label: 'Medium', color: '#f5902a', tint: '#fff5e8', desc: 'มีโอกาสพอสมควร ต้องติดตามต่อเนื่อง' },
  { value: 'Low', label: 'Low', color: '#e3b11a', tint: '#fffbe6', desc: 'โอกาสต่ำหรือยังไม่ชัดเจน' },
  { value: 'None', label: 'None', color: '#9aa2b4', tint: '#f4f6fa', desc: 'ไม่พบโอกาสทางธุรกิจ' }
];
// คำอธิบายระดับลูกค้า — ปรับข้อความได้ที่นี่ที่เดียว
const CUSTOMER_LEVELS = [
  { value: 'No Change', label: 'No Change', color: '#9aa2b4', tint: '#f4f6fa', desc: 'คงระดับลูกค้าเดิม ไม่มีการเปลี่ยนแปลง' },
  { value: 'L1 Strategic', label: 'L1 Strategic', color: '#2f5bff', tint: '#eef3ff', desc: 'ลูกค้าเชิงกลยุทธ์ มูลค่าและศักยภาพสูงสุด' },
  { value: 'L2 Growth', label: 'L2 Growth', color: '#1fae62', tint: '#e8f7ee', desc: 'ลูกค้ามีแนวโน้มเติบโต ควรเร่งขยายธุรกิจ' },
  { value: 'L3 Maintain', label: 'L3 Maintain', color: '#0ea5b7', tint: '#e5f8fa', desc: 'ลูกค้าปัจจุบัน รักษาความสัมพันธ์และยอดขาย' },
  { value: 'L4 Develop', label: 'L4 Develop', color: '#f5a524', tint: '#fff6e0', desc: 'ลูกค้าที่ต้องพัฒนาความสัมพันธ์และสร้างโอกาส' },
  { value: 'L5 Low Priority', label: 'L5 Low Priority', color: '#8b93a7', tint: '#f1f3f7', desc: 'ลำดับความสำคัญต่ำ ติดตามตามความจำเป็น' }
];

const SECTIONS = [
  { id: 'vf-s1', no: 1, title: 'Request Detail', th: 'รายละเอียดการเข้าพบลูกค้า', nav: 'Request Detail' },
  { id: 'vf-s2', no: 2, title: 'Visit Objective', th: 'วัตถุประสงค์การเข้าพบ', nav: 'Objective' },
  { id: 'vf-s3', no: 3, title: 'During Visit', th: 'ข้อมูลที่พบระหว่างการเข้าพบ', nav: 'During Visit' },
  { id: 'vf-s4', no: 4, title: 'Opportunity Summary', th: 'สรุปโอกาสทางธุรกิจ', nav: 'Opportunity Summary' },
  { id: 'vf-s5', no: 5, title: 'Action Plan', th: 'แผนดำเนินงาน', nav: 'Action Plan' },
  { id: 'vf-s6', no: 6, title: 'Customer Level', th: 'ระดับลูกค้า', nav: 'Customer Level' },
  { id: 'vf-s7', no: 7, title: 'Next Visit', th: 'การเข้าพบครั้งถัดไป', nav: 'Next Visit' },
  { id: 'vf-s8', no: 8, title: 'Remark', th: 'หมายเหตุ', nav: 'Remark' }
];
const EXTRA_SECTION = { id: 'vf-s9', no: 9, title: 'Additional Information', th: 'ข้อมูลเพิ่มเติม', nav: 'Additional Info' };

// ฟิลด์เดิมของระบบ (ผูกกับคอลัมน์จริง) — en = label อังกฤษ, label ไทยมาจาก Form Builder (cf())
const DEFAULT_CORE_LABELS = {
  job_type: 'ประเภทงาน (Job Type)', sales_person: 'ผู้ดูแลการขาย (Sales)', location: 'สถานที่',
  contact_person: 'ผู้ติดต่อ', contact_phone: 'เบอร์โทร', product: 'สินค้า/อุปกรณ์ที่เกี่ยวข้อง',
  participants: 'ผู้ร่วมงาน', transport: 'ยานพาหนะ', license_plate: 'ทะเบียนรถ',
  mileage_out: 'ไมล์ออก', mileage_in: 'ไมล์เข้า', actual_time_out: 'เวลาออกจริง',
  actual_time_back: 'เวลากลับจริง', ot_hours: 'จำนวนชั่วโมง OT',
  customer_tax_id: 'เลขประจำตัวผู้เสียภาษีลูกค้า (Cus. TAX ID)', tax_invoice_date: 'วันที่ออกใบกำกับภาษี (TAX ID & Date)',
  notes: 'รายละเอียดเพิ่มเติม (Remark)', purpose: 'วัตถุประสงค์ / รายละเอียดงาน'
};
const DEFAULT_ESSENTIAL_LABELS = {
  visit_date: 'วันที่', customer_id: 'รหัสลูกค้า / บริษัท',
  time_from: 'เวลาเริ่ม (แผน)', time_to: 'เวลาสิ้นสุด (แผน)', purpose: 'วัตถุประสงค์ / รายละเอียดงาน'
};
const CORE_SPEC = {
  job_type: { en: 'Job Type', type: 'select', options: JOB_TYPES },
  transport: { en: 'Transport', type: 'select', options: TRANSPORTS },
  license_plate: { en: 'Car License', type: 'text', ph: 'e.g. กข 1234' },
  location: { en: 'Location', type: 'text', ph: 'Customer site address', full: true },
  product: { en: 'Product / Equipment', type: 'text', ph: 'e.g. machine, spare part, software' },
  mileage_out: { en: 'Mileage Out', type: 'number', ph: 'Odometer at departure' },
  mileage_in: { en: 'Mileage In', type: 'number', ph: 'Odometer on return' },
  actual_time_out: { en: 'Actual Time Out', type: 'time' },
  actual_time_back: { en: 'Actual Time Back', type: 'time' },
  ot_hours: { en: 'OT Hours', type: 'number', step: '0.5', ph: 'e.g. 1.5' },
  customer_tax_id: { en: 'Customer Tax ID', type: 'text', ph: '0-XXXX-XXXXX-XX-X' },
  tax_invoice_date: { en: 'Tax Invoice Date', type: 'date' },
  notes: { en: 'Remark', type: 'textarea', ph: 'Additional comments, observations, or important notes.', full: true }
};
const CORE_KEYS = ['job_type', 'sales_person', 'location', 'contact_person', 'contact_phone', 'product', 'participants', 'transport',
  'license_plate', 'mileage_out', 'mileage_in', 'actual_time_out', 'actual_time_back', 'ot_hours', 'customer_tax_id', 'tax_invoice_date', 'notes'];
// ตำแหน่ง anchor ของ Custom Field (position_after) ที่ฟอร์มนี้มีที่ให้วาง — ที่เหลือไปรวมในหัวข้อ Additional Information
const GROUP_ANCHORS = ['GRP_company', 'GRP_customer', 'GRP_contact', 'GRP_visit', 'GRP_people', 'GRP_trip']; // วางท้ายกลุ่มในฟอร์ม (เลือกได้จาก Form Builder)
const ANCHOR_KEYS = new Set(['TOP', ...GROUP_ANCHORS, 'visit_date', 'customer_id', 'time_from', 'time_to', 'purpose', ...CORE_KEYS]);
const ANCHOR_SECTION = { notes: 'vf-s8' };

// ---------------------------------------------------------------- ตัวช่วย
const uid = () => Math.random().toString(36).slice(2, 9);
const safeParse = (s, fb) => { try { const v = typeof s === 'string' ? JSON.parse(s) : s; return v === null || v === undefined ? fb : v; } catch (e) { return fb; } };
const blankContact = () => ({ id: uid(), name: '', position: '', telephone: '', ext: '', mobile: '', email: '' });
const blankRow = () => ({
  id: uid(), next_action: '', owner_id: '', owner_name: '', contact: '', due_date: '', expected_result: '',
  // โครงสำหรับระบบแจ้งเตือน/Reminder ในอนาคต (ยังไม่มีการทำงาน)
  status: 'open', reminder: { enabled: false, days_before: null, notified_at: null }
});
const emptyObjective = () => ({ items: [], other: '' });
const emptyDuring = () => ({
  brands: [], brand_notes: '',
  recurring: { value: '', detail: '' },
  problems: { items: [], other: '', detail: '' },
  projects: { items: [], other: '', detail: '', timing: '' },
  potential: { items: [], other: '', product_application: '', current_brand: '', target_brand: '' }
});
const emptyOpp = () => ({ found: [], level: '', description: '' });
const emptyPlan = () => ({ actions: [], rows: [] });
const emptyLevel = () => ({ level: 'No Change', reason: '' });
const emptyNext = () => ({ needed: '', date: '', purpose: '', expected_outcome: '' });
const emptyForm = () => ({
  request_date: todayLocal(), visit_date: todayLocal(), time_from: '09:00', time_to: '16:00', company: '', customer_type: 'current',
  customer_id: '', job_type: JOB_TYPES[0], sales_person: '', purpose: '', location: '', product: '',
  transport: TRANSPORTS[0], license_plate: '', mileage_out: '', mileage_in: '', actual_time_out: '', actual_time_back: '',
  ot_hours: '', customer_tax_id: '', tax_invoice_date: '', notes: '', meeting_start: '', meeting_end: ''
});
const emptyNewCust = () => ({ name: '', address: '', website: '', industry: '' });

const mergeDuring = (raw) => {
  const base = emptyDuring();
  const r = safeParse(raw, {}) || {};
  return {
    ...base, ...r,
    recurring: { ...base.recurring, ...(r.recurring || {}) },
    problems: { ...base.problems, ...(r.problems || {}) },
    projects: { ...base.projects, ...(r.projects || {}) },
    potential: { ...base.potential, ...(r.potential || {}) }
  };
};
const anyContactData = (c) => !!(c.name.trim() || c.position.trim() || c.telephone.trim() || (c.ext || '').trim() || c.mobile.trim() || c.email.trim());
const duringHasData = (d) => !!(d.brands.length || d.brand_notes.trim() || d.recurring.value || d.problems.items.length || d.problems.detail.trim()
  || d.projects.items.length || d.projects.detail.trim() || d.projects.timing || d.potential.items.length
  || d.potential.product_application.trim() || d.potential.current_brand.trim() || d.potential.target_brand.trim());

function relTime(ts, now) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m > 1 ? 's' : ''} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  return `${Math.floor(h / 24)} day(s) ago`;
}
const STATUS_EN = { draft: 'Draft', pending: 'Pending Approval', approved: 'Approved', rejected: 'Rejected', revision: 'Revision Requested', completed: 'Completed', cancelled: 'Cancelled' };

// ================================================================ หน้าหลัก
export default function VisitRequest() {
  const toast = useToast();
  const navigate = useNavigate();
  const { me } = useAuth();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const draftKey = `vf-draft:${me ? me.id : 0}:${editId || 'new'}`;

  // ----- state ข้อมูลฟอร์ม
  const [form, setForm] = useState(emptyForm);
  const [participants, setParticipants] = useState([]);
  const [contacts, setContacts] = useState(() => [blankContact()]);
  const [objective, setObjective] = useState(emptyObjective);
  const [during, setDuring] = useState(emptyDuring);
  const [opp, setOpp] = useState(emptyOpp);
  const [plan, setPlan] = useState(emptyPlan);
  const [level, setLevel] = useState(emptyLevel);
  const [next, setNext] = useState(emptyNext);
  const [newCust, setNewCust] = useState(emptyNewCust);
  const [customValues, setCustomValues] = useState({});
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [editingRequest, setEditingRequest] = useState(null);
  const [loaded, setLoaded] = useState(!editId);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // ----- ข้อมูลอ้างอิง
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [coreSettings, setCoreSettings] = useState({});
  const [essentialLabels, setEssentialLabels] = useState({});
  const [brands, setBrands] = useState([]);
  const [directory, setDirectory] = useState(null);
  const [engineerUsers, setEngineerUsers] = useState([]);

  useEffect(() => {
    api.get('/api/form-fields').then(({ fields }) => setCustomFieldDefs(fields)).catch(() => {});
    api.get('/api/core-field-settings').then(({ settings }) => {
      const map = {}; settings.forEach(s => { map[s.field_key] = s; }); setCoreSettings(map);
    }).catch(() => {});
    api.get('/api/core-field-settings/essential-labels').then(({ labels }) => {
      const map = {}; labels.forEach(l => { map[l.field_key] = l.label; }); setEssentialLabels(map);
    }).catch(() => {});
    api.get('/api/brands').then(({ brands: b }) => setBrands(b || [])).catch(() => {});
    api.get('/api/users/by-department/Engineer').then(({ users }) => setEngineerUsers(users)).catch(() => {});
    api.get('/api/users/directory').then(({ users }) => setDirectory(users)).catch(() => setDirectory([]));
  }, []);

  const cf = (key) => coreSettings[key] || { label: DEFAULT_CORE_LABELS[key], is_visible: true, is_required: false, sort_order: CORE_KEYS.indexOf(key) };
  const el = (key) => essentialLabels[key] || DEFAULT_ESSENTIAL_LABELS[key];
  const orderedKeys = (keys) => [...keys].sort((a, b) => (cf(a).sort_order ?? 0) - (cf(b).sort_order ?? 0));

  // ----- สถานะ accordion + nav
  const [open, setOpen] = useState({ 'vf-s1': true, 'vf-s2': true });
  const [subOpen, setSubOpen] = useState({ d1: true });
  const [tripOpen, setTripOpen] = useState(false);
  const [active, setActive] = useState('vf-s1');

  // ================================================================ โหลดคำขอเดิม (โหมดแก้ไข / อัปเดตหลังปฏิบัติงาน)
  useEffect(() => {
    if (!editId) return;
    api.get(`/api/visit-requests/${editId}`).then(({ request, customFields }) => {
      if (!['draft', 'revision', 'approved'].includes(request.status)) {
        toast('ไม่สามารถแก้ไขคำขอนี้ได้แล้ว', 'error');
        navigate('/my-requests');
        return;
      }
      setEditingRequest(request);
      const cv = {};
      (customFields || []).forEach(f => {
        if (f.field_type === 'multiselect') { try { cv[f.field_key] = JSON.parse(f.value || '[]'); } catch (e) { cv[f.field_key] = []; } }
        else if (f.field_type === 'checkbox') cv[f.field_key] = f.value === 'true';
        else cv[f.field_key] = f.value || '';
      });
      setCustomValues(cv);
      const base = emptyForm();
      setForm({
        ...base,
        request_date: request.request_date || (request.created_at || '').slice(0, 10) || base.request_date,
        visit_date: request.visit_date || base.visit_date,
        time_from: request.time_from || base.time_from,
        time_to: request.time_to || base.time_to,
        company: request.company || '',
        customer_type: request.customer_type || 'current',
        customer_id: request.customer_id || '',
        job_type: request.job_type || JOB_TYPES[0],
        sales_person: request.sales_person || '',
        purpose: request.purpose || '',
        location: request.location || '',
        product: request.product || '',
        transport: request.transport || TRANSPORTS[0],
        license_plate: request.license_plate || '',
        mileage_out: request.mileage_out || '',
        mileage_in: request.mileage_in || '',
        actual_time_out: request.actual_time_out || '',
        actual_time_back: request.actual_time_back || '',
        ot_hours: request.ot_hours || '',
        customer_tax_id: request.customer_tax_id || '',
        tax_invoice_date: request.tax_invoice_date || '',
        notes: request.notes || '',
        meeting_start: request.meeting_start || '',
        meeting_end: request.meeting_end || ''
      });
      setParticipants((request.participants || '').split(',').map(s => s.trim()).filter(Boolean));
      let list = safeParse(request.contacts_json, []);
      if (!Array.isArray(list) || !list.length) {
        // คำขอเก่าก่อนมีรายการผู้ติดต่อหลายคน: ใช้ผู้ติดต่อเดิมเป็นรายการแรก
        list = request.contact_person ? [{ name: request.contact_person, telephone: request.contact_phone || '' }] : [];
      }
      setContacts(list.length ? list.map(c => ({ ...blankContact(), ...c, id: c.id || uid() })) : [blankContact()]);
      const ob = safeParse(request.objective_json, {}) || {};
      setObjective({ ...emptyObjective(), ...ob, items: Array.isArray(ob.items) ? ob.items : [] });
      setDuring(mergeDuring(request.during_visit_json));
      const op = safeParse(request.opportunity_json, {}) || {};
      setOpp({ ...emptyOpp(), ...op, found: Array.isArray(op.found) ? op.found : [] });
      const pl = safeParse(request.action_plan_json, {}) || {};
      setPlan({
        actions: Array.isArray(pl.actions) ? pl.actions : [],
        rows: Array.isArray(pl.rows) ? pl.rows.map(r => ({ ...blankRow(), ...r, id: r.id || uid() })) : []
      });
      setLevel({ ...emptyLevel(), ...(safeParse(request.customer_level_json, {}) || {}) });
      setNext({ ...emptyNext(), ...(safeParse(request.next_visit_json, {}) || {}) });
      // เปิด section ที่มีข้อมูลอยู่แล้ว
      setOpen(o => ({
        ...o,
        'vf-s3': !!request.during_visit_json, 'vf-s4': !!request.opportunity_json, 'vf-s5': !!request.action_plan_json,
        'vf-s6': !!request.customer_level_json, 'vf-s7': !!request.next_visit_json, 'vf-s8': !!request.notes
      }));
      if (request.customer_id) {
        api.get(`/api/customers/${request.customer_id}`).then(r => {
          setSelectedCustomer(r.customer);
          setCustomerQuery(r.customer.code);
          setForm(f => ({ ...f, company: f.company || r.customer.company || '' }));
        }).catch(() => {}).finally(() => setLoaded(true));
      } else {
        setLoaded(true);
      }
    }).catch(err => toast(err.message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // ================================================================ ลูกค้า
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [custHl, setCustHl] = useState(0);
  const [searchingCust, setSearchingCust] = useState(false);
  const custWrap = useRef(null);

  useEffect(() => {
    const q = customerQuery.trim();
    if (!q || selectedCustomer) { setCustomerResults([]); return undefined; }
    setSearchingCust(true);
    const t = setTimeout(() => {
      api.get(`/api/customers?q=${encodeURIComponent(q)}`)
        .then(r => {
          setCustomerResults(r.customers.slice(0, 20));
          // พิมพ์รหัสลูกค้าครบตรงกับลูกค้าเพียงรายเดียว -> เลือกให้อัตโนมัติ (ไม่ต้องกดจากรายการ) เพื่อให้ Level/SSO/ชื่อขึ้นเลย
          const exact = r.customers.filter(c => String(c.code || '').toLowerCase() === q.toLowerCase());
          if (exact.length === 1 && r.customers.length === 1 && form.customer_type !== 'new') pickCustomer(exact[0]);
        })
        .catch(() => setCustomerResults([]))
        .finally(() => setSearchingCust(false));
    }, 250);
    return () => clearTimeout(t);
  }, [customerQuery, selectedCustomer]);

  useEffect(() => {
    if (!customerOpen) return undefined;
    const onDoc = (e) => { if (custWrap.current && !custWrap.current.contains(e.target)) setCustomerOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [customerOpen]);

  // ลูกค้าที่โหลดจากฉบับร่าง/คำขอเดิมอาจไม่มี level ติดมา -> ดึงจากรายชื่อลูกค้าล่าสุด (null = ไม่มีระดับ, undefined = ยังไม่ได้ดึง)
  useEffect(() => {
    if (!selectedCustomer || selectedCustomer.level !== undefined || !selectedCustomer.code) return;
    const cid = selectedCustomer.id;
    api.get(`/api/customers?q=${encodeURIComponent(selectedCustomer.code)}`)
      .then(({ customers }) => {
        const m = customers.find(c => c.id === cid);
        setSelectedCustomer(s => (s && s.id === cid ? { ...s, level: m ? (m.level || null) : null } : s));
      })
      .catch(() => setSelectedCustomer(s => (s && s.id === cid ? { ...s, level: null } : s)));
  }, [selectedCustomer]);

  const pickCustomer = (c) => {
    setSelectedCustomer(c);
    setCustomerQuery(c.code);
    setCustomerOpen(false);
    const prevAddr = selectedCustomer && selectedCustomer.address ? String(selectedCustomer.address).trim() : '';
    setForm(f => ({
      ...f,
      customer_id: c.id,
      company: c.company || f.company,
      sales_person: c.contact_person || '',
      customer_tax_id: c.tax_id || f.customer_tax_id,
      // เติมสถานที่จากที่อยู่ของลูกค้าให้อัตโนมัติ (ไม่ทับสิ่งที่ผู้ใช้พิมพ์เอง: เติมเฉพาะเมื่อว่าง หรือยังเป็นที่อยู่ของลูกค้ารายก่อนหน้า)
      location: (c.address && (!String(f.location || '').trim() || String(f.location).trim() === prevAddr)) ? String(c.address).trim() : f.location
    }));
  };
  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerQuery('');
    setForm(f => ({ ...f, customer_id: '', sales_person: f.customer_type === 'current' ? '' : f.sales_person }));
  };
  const setCustomerType = (t) => {
    if (t === form.customer_type) return;
    setSelectedCustomer(null);
    setCustomerQuery('');
    setForm(f => ({ ...f, customer_type: t, customer_id: '', sales_person: '' }));
  };

  // ลงทะเบียนลูกค้าใหม่ (รอ Admin ตรวจสอบ) — คืนลูกค้าที่สร้าง/ที่ซ้ำกับของเดิม
  const registerNewCustomer = async () => {
    const name = newCust.name.trim();
    if (!name) throw new Error('กรุณากรอกชื่อบริษัท (Company Name)');
    const first = contacts.find(c => c.name.trim());
    try {
      const { customer } = await api.post('/api/customers/pending', {
        name, address: newCust.address, website: newCust.website, industry: newCust.industry,
        tax_id: form.customer_tax_id, contact_person: first ? first.name : '', phone: first ? (first.mobile || first.telephone) : ''
      });
      pickCustomer(customer);
      toast(`ลงทะเบียนลูกค้าใหม่แล้ว (${customer.code}) รอผู้ดูแลระบบตรวจสอบ`, 'success');
      return customer;
    } catch (err) {
      if (err.status === 409 && err.data && err.data.duplicate) {
        pickCustomer(err.data.duplicate);
        toast('มีลูกค้าชื่อนี้อยู่ในระบบแล้ว ระบบเลือกรายเดิมให้แล้ว', 'success');
        return err.data.duplicate;
      }
      throw err;
    }
  };

  // ================================================================ ผู้ติดต่อ / Action plan
  const addContact = () => setContacts(l => [...l, blankContact()]);
  const delContact = (id) => setContacts(l => l.filter(c => c.id !== id));
  const updContact = (id, k, v) => setContacts(l => l.map(c => (c.id === id ? { ...c, [k]: v } : c)));
  const addRow = () => setPlan(p => ({ ...p, rows: [...p.rows, blankRow()] }));
  const delRow = (id) => setPlan(p => ({ ...p, rows: p.rows.filter(r => r.id !== id) }));
  const updRow = (id, patch) => setPlan(p => ({ ...p, rows: p.rows.map(r => (r.id === id ? { ...r, ...patch } : r)) }));

  // ผู้ร่วมงาน
  const participantOptions = useMemo(() => {
    return (directory || []).map(u => ({ value: u.full_name, label: u.full_name, sub: u.department || '' }))
      .sort((a, b) => (a.sub === 'Engineer' ? 0 : 1) - (b.sub === 'Engineer' ? 0 : 1) || a.label.localeCompare(b.label));
  }, [directory]);
  const brandOptions = useMemo(() => brands.map(b => ({ value: b.name, label: b.name })), [brands]);
  const ownerOptions = useMemo(() => (directory || []), [directory]);

  // ================================================================ Custom field (Form Builder)
  const setCustom = (key) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setCustomValues(v => ({ ...v, [key]: val }));
  };
  const toggleMulti = (key, option) => (e) => setCustomValues(v => {
    const cur = Array.isArray(v[key]) ? v[key] : [];
    return { ...v, [key]: e.target.checked ? [...cur, option] : cur.filter(o => o !== option) };
  });
  const setCustomFile = (key) => (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast('ไฟล์ต้องมีขนาดไม่เกิน 4MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => setCustomValues(v => ({ ...v, [key]: reader.result }));
    reader.readAsDataURL(file);
  };

  // ================================================================ ตรวจความครบถ้วน (Required / Error / Success)
  const checks = useMemo(() => {
    const arr = [];
    const add = (key, label, sec, ok, msg) => arr.push({ key, label, sec, ok: !!ok, msg: msg || `กรุณากรอก ${label}` });
    add('request_date', 'Request Date', 'vf-s1', form.request_date);
    add('visit_date', 'Visit Date', 'vf-s1', form.visit_date);
    add('time_from', 'Time Out', 'vf-s1', form.time_from);
    add('time_to', 'Time In', 'vf-s1', form.time_to);
    const ps = cf('purpose');
    if (ps.is_visible && ps.is_required) {
      add('purpose', 'Purpose', 'vf-s1', form.purpose.trim() || objective.items.length,
        `กรุณากรอก ${ps.label} หรือเลือกอย่างน้อย 1 ข้อในหัวข้อ Visit Objective`);
    }
    if (form.customer_type === 'new') {
      add('customer', 'Company Name', 'vf-s1', form.customer_id || newCust.name.trim(), 'กรุณากรอกชื่อบริษัท (Company Name)');
    } else {
      add('customer', 'Customer Code', 'vf-s1', form.customer_id, 'กรุณาเลือกลูกค้าจากรายการค้นหา');
    }
    contacts.forEach((c, i) => {
      if (anyContactData(c)) add(`contact_${c.id}`, `Contact #${i + 1} Name`, 'vf-s1', c.name.trim(), `กรุณากรอกชื่อผู้ติดต่อ (Contact #${i + 1})`);
    });
    // ฟิลด์เดิมที่ Admin ตั้งเป็น "บังคับ" (และยังแสดงอยู่)
    const first = contacts.find(c => c.name.trim());
    const coreVal = {
      ...form,
      participants: participants.join(', '),
      contact_person: first ? first.name : '',
      contact_phone: first ? (first.mobile || first.telephone) : ''
    };
    Object.values(coreSettings).forEach(s => {
      if (!s.is_visible || !s.is_required) return;
      if (s.field_key === 'customer_id' || s.field_key === 'purpose') return;
      const v = coreVal[s.field_key];
      add(`core_${s.field_key}`, s.label, ANCHOR_SECTION[s.field_key] || 'vf-s1', v !== undefined && v !== null && String(v).trim());
    });
    customFieldDefs.forEach(f => {
      if (!f.is_required) return;
      const v = customValues[f.field_key];
      const ok = !(v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length));
      const a = f.position_after || '';
      add(`custom_${f.field_key}`, f.label, ANCHOR_KEYS.has(a) ? (ANCHOR_SECTION[a] || 'vf-s1') : 'vf-s9', ok);
    });
    return arr;
  }, [form, objective, contacts, participants, newCust, coreSettings, customFieldDefs, customValues]);

  const errorMap = useMemo(() => {
    const m = {}; checks.forEach(c => { if (!c.ok) m[c.key] = c.msg; }); return m;
  }, [checks]);
  const err = (key) => (showErrors ? errorMap[key] : undefined);
  const isOk = (key) => !errorMap[key] && checks.some(c => c.key === key);
  const doneCount = checks.filter(c => c.ok).length;
  const pct = checks.length ? Math.round((doneCount / checks.length) * 100) : 0;

  // ================================================================ สถานะแต่ละ section (nav + ชิป)
  const hasExtra = useMemo(() => customFieldDefs.some(f => !ANCHOR_KEYS.has(f.position_after || '')), [customFieldDefs]);
  const notesVisible = cf('notes').is_visible;
  const sections = useMemo(() => {
    const list = SECTIONS.filter(s => s.id !== 'vf-s8' || notesVisible);
    return hasExtra ? [...list, EXTRA_SECTION] : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasExtra, notesVisible, coreSettings]);

  const secInfo = useMemo(() => {
    const missingBy = (id) => checks.filter(c => !c.ok && c.sec === id).length;
    const info = {};
    const m1 = missingBy('vf-s1');
    info['vf-s1'] = m1
      ? { state: showErrors ? 'error' : 'req', text: `${m1} required`, summary: '' }
      : { state: 'done', text: 'Complete', summary: '' };
    info['vf-s2'] = objective.items.length
      ? { state: 'done', text: `${objective.items.length} selected`, summary: objective.items.join(', ') }
      : { state: '', text: 'Optional', summary: '' };
    const dHas = duringHasData(during);
    info['vf-s3'] = dHas
      ? { state: 'done', text: 'Filled', summary: during.brands.length ? `Brands: ${during.brands.join(', ')}` : '' }
      : { state: '', text: 'Optional', summary: '' };
    const oHas = opp.found.length || opp.level || opp.description.trim();
    info['vf-s4'] = oHas ? { state: 'done', text: opp.level ? `${opp.level}` : 'Filled', summary: opp.found.join(', ') } : { state: '', text: 'Optional', summary: '' };
    const pHas = plan.actions.length || plan.rows.some(r => r.next_action.trim() || r.expected_result.trim() || r.owner_id || r.due_date);
    info['vf-s5'] = pHas ? { state: 'done', text: `${plan.rows.length} action${plan.rows.length === 1 ? '' : 's'}`, summary: plan.actions.join(', ') } : { state: '', text: 'Optional', summary: '' };
    info['vf-s6'] = { state: level.level !== 'No Change' || level.reason.trim() ? 'done' : '', text: level.level, summary: level.reason.trim() };
    info['vf-s7'] = next.needed ? { state: 'done', text: next.needed === 'yes' ? 'Yes' : 'No', summary: next.needed === 'yes' ? next.date : '' } : { state: '', text: 'Optional', summary: '' };
    info['vf-s8'] = form.notes.trim() ? { state: 'done', text: 'Filled', summary: form.notes.trim() } : { state: '', text: 'Optional', summary: '' };
    const m9 = missingBy('vf-s9');
    info['vf-s9'] = m9 ? { state: showErrors ? 'error' : 'req', text: `${m9} required`, summary: '' } : { state: '', text: '', summary: '' };
    return info;
  }, [checks, showErrors, objective, during, opp, plan, level, next, form.notes]);

  // ================================================================ scroll-spy + คลิกเมนู
  const goTo = useCallback((id) => {
    setOpen(o => ({ ...o, [id]: true }));
    setActive(id);
    setTimeout(() => {
      const elx = document.getElementById(id);
      if (!elx) return;
      const off = window.innerWidth <= 900 ? 150 : 84;
      window.scrollTo({ top: elx.getBoundingClientRect().top + window.scrollY - off, behavior: 'smooth' });
    }, 40);
  }, []);

  useEffect(() => {
    let raf = 0;
    const calc = () => {
      raf = 0;
      const off = window.innerWidth <= 900 ? 170 : 110;
      let cur = sections[0].id;
      for (const s of sections) {
        const e = document.getElementById(s.id);
        if (e && e.getBoundingClientRect().top - off <= 0) cur = s.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 6) cur = sections[sections.length - 1].id;
      setActive(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(calc); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    calc();
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [sections]);

  const toggleSec = (id) => setOpen(o => ({ ...o, [id]: !o[id] }));
  const expandAll = (v) => { const o = {}; sections.forEach(s => { o[s.id] = v; }); setOpen(o); setSubOpen({ d1: v, d2: v, d3: v, d4: v, d5: v }); };

  // ================================================================ Auto save (เก็บในเครื่องนี้) + dirty
  const snapshot = useMemo(() => JSON.stringify({ form, participants, contacts, objective, during, opp, plan, level, next, newCust, customValues }),
    [form, participants, contacts, objective, during, opp, plan, level, next, newCust, customValues]);
  const baseline = useRef(null);
  const [lastSaved, setLastSaved] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [restoreOffer, setRestoreOffer] = useState(null);

  useEffect(() => { if (loaded && baseline.current === null) baseline.current = snapshot; }, [loaded, snapshot]);
  const dirty = baseline.current !== null && snapshot !== baseline.current;

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(t); }, []);

  // พบฉบับร่างที่ค้างในเครื่อง -> ถามก่อนว่าจะกู้คืนไหม (ไม่ทับข้อมูลเองโดยพลการ)
  useEffect(() => {
    if (!loaded || !me) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) { const p = JSON.parse(raw); if (p && p.data) setRestoreOffer(p); }
    } catch (e) { /* ใช้งานต่อได้แม้ localStorage ใช้ไม่ได้ */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, draftKey]);

  useEffect(() => {
    if (!dirty || restoreOffer) return undefined;
    const t = setTimeout(() => {
      try {
        const cv = {};
        Object.entries(customValues).forEach(([k, v]) => { if (!(typeof v === 'string' && v.startsWith('data:'))) cv[k] = v; });
        const ts = Date.now();
        localStorage.setItem(draftKey, JSON.stringify({
          savedAt: ts,
          data: { form, participants, contacts, objective, during, opp, plan, level, next, newCust, customValues: cv,
            customer: selectedCustomer ? { id: selectedCustomer.id, code: selectedCustomer.code, name: selectedCustomer.name, sso: selectedCustomer.sso, contact_person: selectedCustomer.contact_person, tax_id: selectedCustomer.tax_id, company: selectedCustomer.company, is_pending: selectedCustomer.is_pending } : null }
        }));
        setLastSaved(ts); setNow(ts);
      } catch (e) { /* โควต้าเต็ม/ปิด storage: ข้ามไป */ }
    }, 1200);
    return () => clearTimeout(t);
  }, [snapshot, dirty, restoreOffer]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearLocalDraft = () => { try { localStorage.removeItem(draftKey); } catch (e) { /* ignore */ } };
  const applyDraft = (p) => {
    const d = p.data;
    if (d.form) setForm({ ...emptyForm(), ...d.form });
    if (d.participants) setParticipants(d.participants);
    if (d.contacts && d.contacts.length) setContacts(d.contacts);
    if (d.objective) setObjective({ ...emptyObjective(), ...d.objective });
    if (d.during) setDuring(mergeDuring(d.during));
    if (d.opp) setOpp({ ...emptyOpp(), ...d.opp });
    if (d.plan) setPlan({ ...emptyPlan(), ...d.plan });
    if (d.level) setLevel({ ...emptyLevel(), ...d.level });
    if (d.next) setNext({ ...emptyNext(), ...d.next });
    if (d.newCust) setNewCust({ ...emptyNewCust(), ...d.newCust });
    if (d.customValues) setCustomValues(v => ({ ...v, ...d.customValues }));
    if (d.customer) { setSelectedCustomer(d.customer); setCustomerQuery(d.customer.code); }
    setOpen(o => { const n = { ...o }; sections.forEach(s => { n[s.id] = true; }); return n; });
    setLastSaved(p.savedAt || 0);
    setRestoreOffer(null);
    toast('กู้คืนฉบับร่างที่ค้างไว้แล้ว', 'success');
  };
  const discardDraft = () => { clearLocalDraft(); setRestoreOffer(null); };

  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // ================================================================ บันทึก / ส่ง
  const isPostVisitUpdate = !!editingRequest && editingRequest.status === 'approved';
  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setFv = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const buildPayload = () => {
    const first = contacts.find(c => c.name.trim());
    const cleanContacts = contacts.filter(anyContactData).map(c => ({
      id: c.id, name: c.name.trim(), position: c.position.trim(), telephone: c.telephone.trim(), ext: (c.ext || '').trim(), mobile: c.mobile.trim(), email: c.email.trim()
    }));
    const rows = plan.rows.filter(r => r.next_action.trim() || r.owner_id || r.contact || r.due_date || r.expected_result.trim());
    // Purpose (ฟิลด์เดิมที่ระบบบังคับ): ถ้าเว้นว่าง ใช้ข้อที่เลือกใน Visit Objective แทน
    const purpose = form.purpose.trim() || objective.items.map(i => (i === 'Other' && objective.other.trim() ? `Other: ${objective.other.trim()}` : i)).join(', ');
    return {
      ...form,
      purpose,
      participants: participants.join(', '),
      contact_person: first ? first.name : '',
      contact_phone: first ? (first.mobile || first.telephone) : '',
      mileage_out: form.mileage_out || null,
      mileage_in: form.mileage_in || null,
      ot_hours: form.ot_hours || null,
      contacts_json: cleanContacts,
      objective_json: objective,
      during_visit_json: during,
      opportunity_json: opp,
      action_plan_json: { actions: plan.actions, rows },
      customer_level_json: level,
      next_visit_json: next,
      custom_fields: customValues
    };
  };

  const focusFirstError = (list) => {
    const bad = list[0];
    setOpen(o => ({ ...o, [bad.sec]: true }));
    setTimeout(() => {
      const target = document.querySelector(`[data-vf-field="${bad.key}"]`) || document.getElementById(bad.sec);
      if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - (window.innerWidth <= 900 ? 170 : 110), behavior: 'smooth' });
    }, 60);
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      let customerId = form.customer_id;
      let regSales = null;
      if (!customerId) {
        if (form.customer_type === 'new' && newCust.name.trim()) {
          const c = await registerNewCustomer();
          customerId = c.id;
          regSales = c.contact_person || null;
        } else {
          // ตาราง visit_requests บังคับต้องมีลูกค้า จึงบันทึกฉบับร่างลงระบบโดยไม่เลือกลูกค้าไม่ได้
          toast('กรุณาเลือกลูกค้าก่อนบันทึกฉบับร่างลงระบบ (ข้อมูลที่กรอกถูกเก็บอัตโนมัติไว้ในเครื่องนี้ให้แล้ว)', 'error');
          setSaving(false);
          return;
        }
      }
      const payload = { ...buildPayload(), customer_id: customerId };
      if (regSales && !payload.sales_person) payload.sales_person = regSales;
      if (editingRequest) {
        await api.put(`/api/visit-requests/${editingRequest.id}`, payload);
        toast('บันทึกฉบับร่างสำเร็จ', 'success');
      } else {
        const r = await api.post('/api/visit-requests', { ...payload, save_as: 'draft' });
        toast(`บันทึกฉบับร่างสำเร็จ (${r.code})`, 'success');
      }
      clearLocalDraft(); baseline.current = snapshot;
      setTimeout(() => navigate('/my-requests'), 600);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const bad = checks.filter(c => !c.ok);
    if (bad.length) {
      setShowErrors(true);
      focusFirstError(bad);
      toast(`กรุณากรอกข้อมูลที่จำเป็นให้ครบ (${bad.length} รายการ): ${bad.slice(0, 3).map(b => b.label).join(', ')}${bad.length > 3 ? '...' : ''}`, 'error');
      return;
    }
    setSaving(true);
    try {
      let customerId = form.customer_id;
      if (!customerId && form.customer_type === 'new') {
        const c = await registerNewCustomer();
        customerId = c.id;
      }
      const payload = { ...buildPayload(), customer_id: customerId };
      if (editingRequest) {
        const putRes = await api.put(`/api/visit-requests/${editingRequest.id}`, payload);
        if (isPostVisitUpdate) {
          toast(putRes && putRes.reapproval
            ? `บันทึกแล้ว และส่งให้ผู้อนุมัติอนุมัติอีกครั้ง (${editingRequest.code}) — ${putRes.changes.length} รายการที่แก้ไข`
            : `บันทึกข้อมูลหลังปฏิบัติงานสำเร็จ (${editingRequest.code}) — ไม่มีการเปลี่ยนแปลง จึงไม่ต้องอนุมัติซ้ำ`, 'success');
        } else {
          await api.post(`/api/visit-requests/${editingRequest.id}/submit`);
          toast(`ส่งคำขอสำเร็จ (${editingRequest.code})`, 'success');
        }
      } else {
        const r = await api.post('/api/visit-requests', payload);
        toast(`ส่งคำขอสำเร็จ (${r.code})`, 'success');
      }
      clearLocalDraft(); baseline.current = snapshot;
      setTimeout(() => navigate('/my-requests'), 800);
    } catch (er) {
      toast(er.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (dirty && !window.confirm('มีข้อมูลที่ยังไม่ได้บันทึกลงระบบ ต้องการออกจากหน้านี้หรือไม่?\n(ระบบเก็บฉบับร่างอัตโนมัติไว้ในเครื่องนี้ให้แล้ว)')) return;
    navigate('/my-requests');
  };

  // ================================================================ ตัวช่วย render
  const customByAnchor = useMemo(() => {
    const m = {};
    customFieldDefs.forEach(f => {
      let k = f.position_after || '';
      if (!ANCHOR_KEYS.has(k)) k = '__extra';
      (m[k] = m[k] || []).push(f);
    });
    return m;
  }, [customFieldDefs]);

  const renderCustomField = (f) => {
    const val = customValues[f.field_key] ?? f.default_value ?? '';
    const full = ['textarea', 'multiselect', 'radio', 'checkbox'].includes(f.field_type);
    const key = `custom_${f.field_key}`;
    const common = { className: 'vf-input', value: val, onChange: setCustom(f.field_key), placeholder: f.placeholder || undefined };
    return (
      <Field key={f.id} fid={key} label={f.label} th={f.description || undefined} required={!!f.is_required} full={full} error={err(key)} ok={f.is_required && isOk(key)}>
        {f.field_type === 'text' && <input type="text" {...common} />}
        {f.field_type === 'textarea' && <textarea {...common} className="vf-textarea" />}
        {f.field_type === 'number' && <input type="number" {...common} />}
        {f.field_type === 'email' && <input type="email" {...common} />}
        {f.field_type === 'phone' && <input type="tel" {...common} />}
        {f.field_type === 'date' && <input type="date" {...common} />}
        {f.field_type === 'datetime' && <input type="datetime-local" {...common} />}
        {f.field_type === 'time' && <TimeInput24 value={val} onChange={setCustom(f.field_key)} />}
        {f.field_type === 'dropdown' && (
          <select className="vf-select" value={val} onChange={setCustom(f.field_key)}>
            <option value="">-- เลือก --</option>
            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {f.field_type === 'radio' && (
          <PillRadio name={`custom_${f.field_key}`} options={f.options} value={customValues[f.field_key]} onChange={(v) => setCustomValues(s => ({ ...s, [f.field_key]: v }))} />
        )}
        {f.field_type === 'multiselect' && (
          <CheckGroup options={f.options} value={customValues[f.field_key]} onChange={(v) => setCustomValues(s => ({ ...s, [f.field_key]: v }))} />
        )}
        {f.field_type === 'checkbox' && (
          <label className={`vf-check ${customValues[f.field_key] ? 'on' : ''}`} style={{ maxWidth: 260 }}>
            <input type="checkbox" checked={!!customValues[f.field_key]} onChange={setCustom(f.field_key)} /><span>ใช่ / ตกลง</span>
          </label>
        )}
        {f.field_type === 'file' && (
          <>
            <input type="file" onChange={setCustomFile(f.field_key)} />
            {customValues[f.field_key] && <div className="vf-msg ok">แนบไฟล์แล้ว ✓</div>}
          </>
        )}
      </Field>
    );
  };
  const anchored = (k) => (customByAnchor[k] || []).map(renderCustomField);

  // ฟิลด์เดิม 1 ตัว (ตามชนิดที่กำหนดใน CORE_SPEC) + Custom Field ที่ Admin วางต่อท้าย
  const renderCore = (key) => {
    const s = cf(key);
    const spec = CORE_SPEC[key];
    const out = [];
    if (s.is_visible && spec) {
      const v = form[key];
      const ek = `core_${key}`;
      out.push(
        <Field key={key} fid={ek} label={spec.en} th={s.label} required={!!s.is_required} full={spec.full} error={err(ek)} ok={s.is_required && isOk(ek)}>
          {spec.type === 'select' && <select className="vf-select" value={v} onChange={setF(key)}>{spec.options.map(o => <option key={o} value={o}>{o}</option>)}</select>}
          {spec.type === 'text' && <input type="text" className="vf-input" value={v} onChange={setF(key)} placeholder={spec.ph} />}
          {spec.type === 'number' && <input type="number" className="vf-input" step={spec.step} value={v} onChange={setF(key)} placeholder={spec.ph} />}
          {spec.type === 'time' && <TimeInput24 value={v} onChange={setF(key)} />}
          {spec.type === 'date' && <input type="date" className="vf-input" value={v} onChange={setF(key)} />}
          {spec.type === 'textarea' && <textarea className="vf-textarea lg" value={v} onChange={setF(key)} placeholder={spec.ph} />}
        </Field>
      );
    }
    return <React.Fragment key={key}>{out}{anchored(key)}</React.Fragment>;
  };

  const sIn = (id) => secInfo[id] || {};
  const sel = selectedCustomer;
  const isNewMode = form.customer_type === 'new';
  const statusKey = editingRequest ? editingRequest.status : 'draft';
  const title = 'Visit Request';

  return (
    <Layout title={title}>
      <form className="vf-page" onSubmit={handleSubmit} noValidate>
        {/* ---------------- Header ---------------- */}
        <div className="vf-head">
          <div>
            <h2 className="vf-title">Visit Request</h2>
            <p className="vf-sub">Create and manage customer visit activities, opportunities, and follow-up actions.</p>
          </div>
          <div className="vf-head-meta">
            {editingRequest && <span className="vf-code">{editingRequest.code}</span>}
            <span className={`vf-status ${statusKey}`}>{STATUS_EN[statusKey] || statusKey}</span>
          </div>
        </div>

        {editingRequest && editingRequest.status === 'revision' && editingRequest.approval_note && (
          <div className="vf-banner warn"><b>ผู้อนุมัติขอให้แก้ไข:</b> {editingRequest.approval_note}</div>
        )}
        {isPostVisitUpdate && (
          <div className="vf-banner ok">คำขอนี้อนุมัติแล้ว — แก้ไขข้อมูลได้ทุกช่อง เมื่อกด "Save Changes" ระบบจะส่งกลับให้ผู้อนุมัติอนุมัติอีกครั้ง พร้อมแจ้งรายการที่แก้ไข (ถ้าไม่ได้เปลี่ยนอะไร จะไม่ต้องอนุมัติซ้ำ)</div>
        )}
        {restoreOffer && (
          <div className="vf-banner info">
            <span>พบฉบับร่างที่ยังไม่ได้บันทึกลงระบบ (เก็บอัตโนมัติไว้ในเครื่องนี้เมื่อ {relTime(restoreOffer.savedAt, now)})</span>
            <span className="vf-banner-actions">
              <button type="button" className="vf-btn sm" onClick={() => applyDraft(restoreOffer)}>Restore</button>
              <button type="button" className="vf-btn sm" onClick={discardDraft}>Discard</button>
            </span>
          </div>
        )}

        <div className="vf-layout">
          {/* ---------------- Sticky left navigation ---------------- */}
          <nav className="vf-nav" aria-label="Form sections">
            <div className="vf-nav-title">Sections</div>
            <ul className="vf-nav-list">
              {sections.map(s => {
                const st = sIn(s.id).state;
                return (
                  <li key={s.id}>
                    <button type="button" className={`vf-nav-item ${active === s.id ? 'active' : ''} ${st === 'done' ? 'done' : ''} ${st === 'error' ? 'error' : ''}`} onClick={() => goTo(s.id)}>
                      <span className="vf-nav-no">{st === 'done' ? '✓' : st === 'error' ? '!' : s.no}</span>
                      <span className="vf-nav-label">{s.nav}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="vf-progress">
              <div className="vf-progress-top"><span>Required fields</span><span>{doneCount}/{checks.length}</span></div>
              <div className="vf-progress-bar"><i style={{ width: `${pct}%` }} /></div>
            </div>
            <div className="vf-nav-tools">
              <button type="button" onClick={() => expandAll(true)}>Expand all</button>
              <button type="button" onClick={() => expandAll(false)}>Collapse all</button>
            </div>
          </nav>

          {/* ---------------- Main content ---------------- */}
          <div className="vf-main">
            {/* ===== SECTION 1 ===== */}
            <Section id="vf-s1" no={1} title="Request Detail" th="รายละเอียดการเข้าพบลูกค้า" open={!!open['vf-s1']} onToggle={() => toggleSec('vf-s1')}
              status={sIn('vf-s1').state} statusText={sIn('vf-s1').text}>
              <Group title="Company Information" th="ข้อมูลบริษัท">
                <div className="vf-grid">
                  <Field label="Company" th="บริษัทในเครือที่รับผิดชอบ">
                    <select className="vf-select" value={form.company} onChange={setF('company')}>
                      <option value="">-- Select company --</option>
                      {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
                {anchored('GRP_company').length > 0 && <div className="vf-grid" style={{ marginTop: 16 }}>{anchored('GRP_company')}</div>}
              </Group>

              <Group title="Customer Information" th="ข้อมูลลูกค้า">
                <Field label="Customer Type" th="ประเภทลูกค้า">
                  <PillRadio name="customer_type" value={form.customer_type} onChange={setCustomerType}
                    options={[{ value: 'current', label: 'Current Customer' }, { value: 'new', label: 'New Customer' }]} />
                </Field>
                <div className="vf-cond">
                  {!isNewMode ? (
                    <div className="vf-grid">
                      <Field fid="customer" label="Customer Code" th={el('customer_id')} required error={err('customer')} ok={isOk('customer') && !!form.customer_id}>
                        <div className="vf-picker" ref={custWrap}>
                          <div className="vf-picker-box">
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5L17 17" /></svg>
                            <input type="text" value={customerQuery} placeholder="Search by customer code or name..." autoComplete="off"
                              onChange={(e) => {
                                setCustomerQuery(e.target.value); setCustomerOpen(true); setCustHl(0);
                                if (selectedCustomer) { setSelectedCustomer(null); setForm(f => ({ ...f, customer_id: '', sales_person: '' })); }
                              }}
                              onFocus={() => setCustomerOpen(true)}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowDown') { e.preventDefault(); setCustHl(h => Math.min(h + 1, customerResults.length - 1)); }
                                else if (e.key === 'ArrowUp') { e.preventDefault(); setCustHl(h => Math.max(h - 1, 0)); }
                                else if (e.key === 'Enter' && customerOpen && customerResults[custHl]) { e.preventDefault(); pickCustomer(customerResults[custHl]); }
                                else if (e.key === 'Escape') setCustomerOpen(false);
                              }} />
                          </div>
                          {customerOpen && customerQuery.trim() && !selectedCustomer && (
                            <div className="vf-pop" role="listbox">
                              {customerResults.map((c, i) => (
                                <div key={c.id} className={`vf-opt ${i === custHl ? 'hl' : ''}`} onMouseDown={(e) => { e.preventDefault(); pickCustomer(c); }} onMouseEnter={() => setCustHl(i)}>
                                  <span><b>{c.code}</b> <small>{c.name}</small>{c.is_pending ? <small style={{ color: '#b7791f' }}> · ใหม่/รอตรวจสอบ</small> : null}</span>
                                  {c.company ? <span className="vf-opt-sub">{c.company}</span> : null}
                                </div>
                              ))}
                              {!customerResults.length && <div className="vf-pop-empty">{searchingCust ? 'กำลังค้นหา...' : 'ไม่พบลูกค้า'}</div>}
                              <button type="button" className="vf-pop-add" onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { setNewCust(n => ({ ...n, name: n.name || customerQuery.trim() })); setCustomerType('new'); }}>
                                ไม่พบลูกค้า? + เพิ่มเป็น New Customer
                              </button>
                            </div>
                          )}
                        </div>
                      </Field>
                      <Field label="Customer Name" th="ชื่อลูกค้า (เติมอัตโนมัติ)">
                        <input type="text" className="vf-input ro" readOnly value={sel ? sel.name : ''} placeholder="Auto-filled from Customer Code" tabIndex={-1} />
                      </Field>
                      <Field label="SSO" th="เติมอัตโนมัติ">
                        <input type="text" className="vf-input ro" readOnly value={sel ? (sel.sso || '') : ''} placeholder="Auto-filled" tabIndex={-1} />
                      </Field>
                      <Field label="Customer Level" th="ระดับลูกค้าปัจจุบัน (เติมอัตโนมัติ)">
                        {!sel ? <input type="text" className="vf-input ro" readOnly value="" placeholder="Auto-filled from Customer Code" tabIndex={-1} />
                          : sel.level === undefined ? <input type="text" className="vf-input ro" readOnly value="กำลังโหลด..." tabIndex={-1} />
                          : (() => {
                            const lv = CUSTOMER_LEVELS.find(l => l.value === sel.level);
                            return lv
                              ? <span className="vf-level-chip" style={{ background: lv.tint, color: lv.color, borderColor: lv.color }}>{lv.label}<small style={{ fontWeight: 400, color: 'var(--text-500)' }}>{lv.desc}</small></span>
                              : <input type="text" className="vf-input ro" readOnly value="ยังไม่ได้กำหนดระดับ" tabIndex={-1} />;
                          })()}
                      </Field>
                      {cf('sales_person').is_visible && (
                        <Field fid="core_sales_person" label="Sales Name" th={cf('sales_person').label} required={!!cf('sales_person').is_required} error={err('core_sales_person')}>
                          <input type="text" className={`vf-input ${sel && sel.contact_person ? 'ro' : ''}`} readOnly={!!(sel && sel.contact_person)}
                            value={form.sales_person} onChange={setF('sales_person')} placeholder={sel ? (sel.contact_person ? '' : 'ไม่มีข้อมูลในระบบ — กรอกเองได้') : 'Auto-filled'} tabIndex={sel && sel.contact_person ? -1 : 0} />
                        </Field>
                      )}
                    </div>
                  ) : (
                    <>
                      {sel && form.customer_id ? (
                        <div className="vf-banner ok" style={{ marginBottom: 14 }}>
                          <span>ลูกค้าที่เลือก: <b>{sel.code}</b> — {sel.name} {sel.is_pending ? <span className="vf-pending-tag">รอตรวจสอบ</span> : null}</span>
                          <span className="vf-banner-actions"><button type="button" className="vf-btn sm" onClick={clearCustomer}>Change</button></span>
                        </div>
                      ) : (
                        <div className="vf-grid cols-2">
                          <Field fid="customer" label="Company Name" th="ชื่อบริษัทลูกค้า" required error={err('customer')} ok={isOk('customer') && !!newCust.name.trim()}>
                            <input type="text" className="vf-input" value={newCust.name} onChange={(e) => setNewCust(n => ({ ...n, name: e.target.value }))} placeholder="Company name" />
                          </Field>
                          <Field label="Industry" th="อุตสาหกรรม">
                            <input type="text" className="vf-input" value={newCust.industry} onChange={(e) => setNewCust(n => ({ ...n, industry: e.target.value }))} placeholder="e.g. Automotive, Food & Beverage" />
                          </Field>
                          <Field label="Website" th="เว็บไซต์">
                            <input type="text" className="vf-input" value={newCust.website} onChange={(e) => setNewCust(n => ({ ...n, website: e.target.value }))} placeholder="https://" />
                          </Field>
                          <Field label="Company Address" th="ที่อยู่บริษัท" full>
                            <textarea className="vf-textarea" style={{ minHeight: 64 }} value={newCust.address} onChange={(e) => setNewCust(n => ({ ...n, address: e.target.value }))} placeholder="Address" />
                          </Field>
                          {cf('sales_person').is_visible && (
                            <Field fid="core_sales_person" label="Sales Name" th={cf('sales_person').label} required={!!cf('sales_person').is_required} error={err('core_sales_person')}>
                              <input type="text" className="vf-input" value={form.sales_person} onChange={setF('sales_person')} placeholder="Sales in charge (if any)" />
                            </Field>
                          )}
                          <div className="vf-field full vf-hint" style={{ marginTop: 0 }}>
                            ระบบจะลงทะเบียนเป็นลูกค้าใหม่ (รหัสชั่วคราว NEW-xxxx) เมื่อกด Save Draft / Submit โดยผู้ดูแลระบบจะตรวจสอบและใส่รหัสจริงภายหลัง
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
                {anchored('customer_id')}
                {anchored('sales_person').length > 0 && <div className="vf-grid" style={{ marginTop: 16 }}>{anchored('sales_person')}</div>}
                <div className="vf-grid" style={{ marginTop: 16 }}>
                  {orderedKeys(['customer_tax_id', 'tax_invoice_date']).map(renderCore)}
                </div>
                {anchored('GRP_customer').length > 0 && <div className="vf-grid" style={{ marginTop: 16 }}>{anchored('GRP_customer')}</div>}
              </Group>

              <Group title="Contact Information" th="ข้อมูลผู้ติดต่อ"
                tools={<button type="button" className="vf-btn add sm" onClick={addContact}>+ Add Contact</button>}>
                {contacts.length === 0 && <div className="vf-empty">ยังไม่มีผู้ติดต่อ — กด “+ Add Contact” เพื่อเพิ่ม</div>}
                {contacts.map((c, i) => {
                  const ek = `contact_${c.id}`;
                  return (
                    <div className="vf-contact" key={c.id}>
                      <div className="vf-contact-head">
                        <span className="vf-contact-no">{i + 1}</span>
                        <span className="vf-contact-title">Contact {i + 1}</span>
                        <button type="button" className="vf-btn danger sm" style={{ marginLeft: 'auto' }} onClick={() => delContact(c.id)} aria-label={`Delete contact ${i + 1}`}>Delete</button>
                      </div>
                      <div className="vf-grid">
                        <Field fid={ek} label="Contact Name" th="ชื่อผู้ติดต่อ" required error={err(ek)} ok={anyContactData(c) && !!c.name.trim()}>
                          <input type="text" className="vf-input" value={c.name} onChange={(e) => updContact(c.id, 'name', e.target.value)} placeholder="Full name" />
                        </Field>
                        <Field label="Position" th="ตำแหน่ง">
                          <input type="text" className="vf-input" value={c.position} onChange={(e) => updContact(c.id, 'position', e.target.value)} />
                        </Field>
                        <Field label="Telephone / Ext." th="เบอร์โทรศัพท์ - เบอร์ต่อ">
                          <div className="vf-tel-row">
                            <input type="tel" className="vf-input" value={c.telephone} onChange={(e) => updContact(c.id, 'telephone', e.target.value)} placeholder="0x-xxx-xxxx" aria-label="Telephone" />
                            <span className="vf-tel-dash" aria-hidden="true">-</span>
                            <input type="text" inputMode="numeric" className="vf-input vf-tel-ext" value={c.ext || ''} maxLength={10}
                              onChange={(e) => updContact(c.id, 'ext', e.target.value.replace(/[^0-9#*,-]/g, ''))} placeholder="ต่อ" aria-label="Extension" />
                          </div>
                        </Field>
                        <Field label="Mobile" th="เบอร์มือถือ">
                          <input type="tel" className="vf-input" value={c.mobile} onChange={(e) => updContact(c.id, 'mobile', e.target.value)} placeholder="08x-xxx-xxxx" />
                        </Field>
                        <Field label="Email" th="อีเมล">
                          <input type="email" className="vf-input" value={c.email} onChange={(e) => updContact(c.id, 'email', e.target.value)} placeholder="name@company.com" />
                        </Field>
                      </div>
                    </div>
                  );
                })}
                {contacts.length > 0 && <button type="button" className="vf-btn add" onClick={addContact}>+ Add Contact</button>}
                {(anchored('contact_person').length > 0 || anchored('contact_phone').length > 0) && (
                  <div className="vf-grid" style={{ marginTop: 16 }}>{anchored('contact_person')}{anchored('contact_phone')}</div>
                )}
                {anchored('GRP_contact').length > 0 && <div className="vf-grid" style={{ marginTop: 16 }}>{anchored('GRP_contact')}</div>}
              </Group>

              <Group title="Visit Information" th="ข้อมูลการเข้าพบ">
                <div className="vf-grid">
                  {anchored('TOP')}
                  <Field fid="request_date" label="Request Date" th="วันที่ทำคำขอ" required error={err('request_date')} ok={isOk('request_date') && !!form.request_date}>
                    <input type="date" className="vf-input" value={form.request_date} onChange={setF('request_date')} />
                  </Field>
                  <Field fid="visit_date" label="Visit Date" th={el('visit_date')} required error={err('visit_date')} ok={isOk('visit_date') && !!form.visit_date}>
                    <input type="date" className="vf-input" value={form.visit_date} onChange={setF('visit_date')} />
                  </Field>
                  {anchored('visit_date')}
                  <Field fid="time_from" label="Time Out" th={el('time_from')} required error={err('time_from')} ok={isOk('time_from') && !!form.time_from}>
                    <TimeInput24 value={form.time_from} onChange={setF('time_from')} />
                  </Field>
                  {anchored('time_from')}
                  <Field fid="time_to" label="Time In" th={el('time_to')} required error={err('time_to')} ok={isOk('time_to') && !!form.time_to}>
                    <TimeInput24 value={form.time_to} onChange={setF('time_to')} />
                  </Field>
                  {anchored('time_to')}
                  {orderedKeys(['job_type', 'transport', 'license_plate']).map(renderCore)}
                  {cf('purpose').is_visible && (
                    <Field fid="purpose" label="Purpose / Job Detail" th={cf('purpose').label} required={!!cf('purpose').is_required} full error={err('purpose')} ok={cf('purpose').is_required && isOk('purpose') && !!form.purpose.trim()}
                      hint={!form.purpose.trim() ? 'ถ้าเว้นว่าง ระบบจะใช้ข้อที่เลือกใน Visit Objective เป็นวัตถุประสงค์ให้อัตโนมัติ' : undefined}>
                      <input type="text" className="vf-input" value={form.purpose} onChange={setF('purpose')} placeholder="e.g. Visit customer to present products and services" />
                    </Field>
                  )}
                  {anchored('purpose')}
                  {orderedKeys(['location', 'product']).map(renderCore)}
                </div>
                {anchored('GRP_visit').length > 0 && <div className="vf-grid" style={{ marginTop: 16 }}>{anchored('GRP_visit')}</div>}
              </Group>

              <Group title="Trip & Post-visit Details" th="ข้อมูลการเดินทางและหลังปฏิบัติงาน"
                tools={<button type="button" className="vf-link" onClick={() => setTripOpen(v => !v)}>{tripOpen ? 'Hide' : 'Show'}</button>}>
                {(tripOpen || ['mileage_out', 'mileage_in', 'ot_hours'].some(k => form[k] || err(`core_${k}`))) ? (
                  <div className="vf-grid">
                    {orderedKeys(['mileage_out', 'mileage_in', 'ot_hours']).map(renderCore)}
                  </div>
                ) : (
                  <div className="vf-hint" style={{ marginTop: 0 }}>Mileage and OT hours — กรอกเมื่อมีข้อมูล (มักบันทึกหลังกลับจากการเข้าพบ)</div>
                )}
                {anchored('GRP_trip').length > 0 && <div className="vf-grid" style={{ marginTop: 16 }}>{anchored('GRP_trip')}</div>}
              </Group>

              <Group title="Accompanied Employees" th="ผู้ร่วมงาน">
                {cf('participants').is_visible && (
                  <Field fid="core_participants" label="Employees" th={cf('participants').label} required={!!cf('participants').is_required} error={err('core_participants')} ok={cf('participants').is_required && isOk('core_participants')}>
                    <DeptParticipants directory={directory} value={participants} onChange={setParticipants} />
                    <MultiPicker
                      options={participantOptions} value={participants} onChange={setParticipants} allowCustom
                      loading={directory === null}
                      placeholder="Search employee or type a name..." emptyText="ไม่พบพนักงาน"
                      customLabel={(t) => `+ เพิ่ม "${t}" เป็นผู้ร่วมงาน (พิมพ์เอง)`}
                    />
                  </Field>
                )}
                {anchored('participants')}
                {anchored('GRP_people').length > 0 && <div className="vf-grid" style={{ marginTop: 16 }}>{anchored('GRP_people')}</div>}
              </Group>


            </Section>

            {/* ===== SECTION 2 ===== */}
            <Section id="vf-s2" no={2} title="Visit Objective" th="วัตถุประสงค์การเข้าพบ" open={!!open['vf-s2']} onToggle={() => toggleSec('vf-s2')}
              status={sIn('vf-s2').state} statusText={sIn('vf-s2').text} summary={sIn('vf-s2').summary}>
              <p className="vf-question">What do we want to find from this visit?<small>เราต้องการหาอะไรจากการเข้าพบครั้งนี้</small></p>
              <CheckGroup options={OBJECTIVES} value={objective.items} onChange={(v) => setObjective(o => ({ ...o, items: v }))} />
              {objective.items.includes('Other') && (
                <div className="vf-cond">
                  <Field label="Other (please specify)" th="ระบุเพิ่มเติม">
                    <input type="text" className="vf-input" value={objective.other} onChange={(e) => setObjective(o => ({ ...o, other: e.target.value }))} placeholder="Specify other objective" />
                  </Field>
                </div>
              )}
            </Section>

            {/* ===== SECTION 3 ===== */}
            <Section id="vf-s3" no={3} title="During Visit" th="ข้อมูลที่พบระหว่างการเข้าพบ" open={!!open['vf-s3']} onToggle={() => toggleSec('vf-s3')}
              status={sIn('vf-s3').state} statusText={sIn('vf-s3').text} summary={sIn('vf-s3').summary}>
              <SubAccordion no="3.1" title="Current Products / Brands" th="สินค้า/ยี่ห้อที่ลูกค้าใช้อยู่" open={!!subOpen.d1} onToggle={() => setSubOpen(o => ({ ...o, d1: !o.d1 }))}
                summary={during.brands.join(', ')}>
                <Field label="Brands" th="เลือกได้หลายยี่ห้อ (ดึงจาก Brand Master)">
                  <MultiPicker options={brandOptions} value={during.brands} onChange={(v) => setDuring(d => ({ ...d, brands: v }))}
                    placeholder="Search brand..." emptyText="ไม่พบยี่ห้อ" loading={false} />
                </Field>
                <div style={{ height: 14 }} />
                <Field label="Additional Notes" th="หมายเหตุเพิ่มเติม">
                  <textarea className="vf-textarea" value={during.brand_notes} onChange={(e) => setDuring(d => ({ ...d, brand_notes: e.target.value }))} placeholder="Other brands, model numbers, quantities..." />
                </Field>
              </SubAccordion>

              <SubAccordion no="3.2" title="Recurring Part Demand" th="ความต้องการอะไหล่/สินค้าต่อเนื่อง" open={!!subOpen.d2} onToggle={() => setSubOpen(o => ({ ...o, d2: !o.d2 }))}
                summary={during.recurring.value === 'yes' ? 'Yes' : during.recurring.value === 'no' ? 'No' : during.recurring.value === 'need_info' ? 'Need More Information' : ''}>
                <PillRadio name="recurring" value={during.recurring.value} onChange={(v) => setDuring(d => ({ ...d, recurring: { ...d.recurring, value: v } }))}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'need_info', label: 'Need More Information' }]} />
                {during.recurring.value === 'yes' && (
                  <div className="vf-cond">
                    <Field label="Product / Application" th="สินค้า / งานที่ใช้">
                      <textarea className="vf-textarea" value={during.recurring.detail} onChange={(e) => setDuring(d => ({ ...d, recurring: { ...d.recurring, detail: e.target.value } }))} placeholder="Which parts / products are needed regularly?" />
                    </Field>
                  </div>
                )}
              </SubAccordion>

              <SubAccordion no="3.3" title="Customer Problem / Improvement" th="ปัญหา/สิ่งที่ลูกค้าต้องการปรับปรุง" open={!!subOpen.d3} onToggle={() => setSubOpen(o => ({ ...o, d3: !o.d3 }))}
                summary={during.problems.items.join(', ')}>
                <CheckGroup options={PROBLEMS} exclusive={['No Current Problem']} value={during.problems.items} onChange={(v) => setDuring(d => ({ ...d, problems: { ...d.problems, items: v } }))} />
                {during.problems.items.includes('Other') && (
                  <div className="vf-cond">
                    <Field label="Other (please specify)" th="ระบุเพิ่มเติม">
                      <input type="text" className="vf-input" value={during.problems.other} onChange={(e) => setDuring(d => ({ ...d, problems: { ...d.problems, other: e.target.value } }))} />
                    </Field>
                  </div>
                )}
                <div style={{ height: 14 }} />
                <Field label="Customer Problem / Requirement" th="รายละเอียดปัญหา / ความต้องการของลูกค้า">
                  <textarea className="vf-textarea lg" value={during.problems.detail} onChange={(e) => setDuring(d => ({ ...d, problems: { ...d.problems, detail: e.target.value } }))} placeholder="Describe the problem or requirement in detail..." />
                </Field>
              </SubAccordion>

              <SubAccordion no="3.4" title="Upcoming Project / Future Plan" th="โครงการ/แผนในอนาคตของลูกค้า" open={!!subOpen.d4} onToggle={() => setSubOpen(o => ({ ...o, d4: !o.d4 }))}
                summary={during.projects.items.join(', ')}>
                <CheckGroup options={PROJECTS} exclusive={['No Known Project']} value={during.projects.items} onChange={(v) => setDuring(d => ({ ...d, projects: { ...d.projects, items: v } }))} />
                {during.projects.items.includes('Other') && (
                  <div className="vf-cond">
                    <Field label="Other (please specify)" th="ระบุเพิ่มเติม">
                      <input type="text" className="vf-input" value={during.projects.other} onChange={(e) => setDuring(d => ({ ...d, projects: { ...d.projects, other: e.target.value } }))} />
                    </Field>
                  </div>
                )}
                <div style={{ height: 14 }} />
                <Field label="Project / Future Plan" th="รายละเอียดโครงการ / แผนในอนาคต">
                  <textarea className="vf-textarea lg" value={during.projects.detail} onChange={(e) => setDuring(d => ({ ...d, projects: { ...d.projects, detail: e.target.value } }))} placeholder="Describe the project or future plan..." />
                </Field>
                <div style={{ height: 14 }} />
                <Field label="Expected Timing" th="ช่วงเวลาที่คาดว่าจะเกิดขึ้น">
                  <PillRadio name="timing" options={TIMINGS} value={during.projects.timing} onChange={(v) => setDuring(d => ({ ...d, projects: { ...d.projects, timing: v } }))} />
                </Field>
              </SubAccordion>

              <SubAccordion no="3.5" title="Potential Product Opportunity" th="โอกาสสินค้าที่ Trisak นำเสนอได้" open={!!subOpen.d5} onToggle={() => setSubOpen(o => ({ ...o, d5: !o.d5 }))}
                summary={during.potential.items.join(', ')}>
                <p className="vf-question">What else can Trisak introduce?<small>Trisak สามารถนำเสนออะไรเพิ่มเติมได้บ้าง</small></p>
                <CheckGroup options={POTENTIALS} value={during.potential.items} onChange={(v) => setDuring(d => ({ ...d, potential: { ...d.potential, items: v } }))} />
                {during.potential.items.includes('Other') && (
                  <div className="vf-cond">
                    <Field label="Other (please specify)" th="ระบุเพิ่มเติม">
                      <input type="text" className="vf-input" value={during.potential.other} onChange={(e) => setDuring(d => ({ ...d, potential: { ...d.potential, other: e.target.value } }))} />
                    </Field>
                  </div>
                )}
                <div style={{ height: 14 }} />
                <div className="vf-grid">
                  <Field label="Potential Product / Application" th="สินค้า / งานที่มีโอกาส" full>
                    <input type="text" className="vf-input" value={during.potential.product_application} onChange={(e) => setDuring(d => ({ ...d, potential: { ...d.potential, product_application: e.target.value } }))} />
                  </Field>
                  <Field label="Current Brand" th="ยี่ห้อที่ใช้อยู่">
                    <input type="text" className="vf-input" value={during.potential.current_brand} onChange={(e) => setDuring(d => ({ ...d, potential: { ...d.potential, current_brand: e.target.value } }))} />
                  </Field>
                  <Field label="Target Brand / Product" th="ยี่ห้อ/สินค้าเป้าหมาย">
                    <input type="text" className="vf-input" value={during.potential.target_brand} onChange={(e) => setDuring(d => ({ ...d, potential: { ...d.potential, target_brand: e.target.value } }))} />
                  </Field>
                </div>
              </SubAccordion>
            </Section>

            {/* ===== SECTION 4 ===== */}
            <Section id="vf-s4" no={4} title="Opportunity Summary" th="สรุปโอกาสทางธุรกิจ" open={!!open['vf-s4']} onToggle={() => toggleSec('vf-s4')}
              status={sIn('vf-s4').state} statusText={sIn('vf-s4').text} summary={sIn('vf-s4').summary}>
              <Group title="What did we find?" th="เราพบอะไรจากการเข้าพบ">
                <CheckGroup options={FOUND} exclusive={['No Opportunity']} value={opp.found} onChange={(v) => setOpp(o => ({ ...o, found: v }))} />
              </Group>
              <Group title="Opportunity Level" th="ระดับโอกาส">
                <RadioCards name="opp_level" options={OPP_LEVELS} value={opp.level} onChange={(v) => setOpp(o => ({ ...o, level: v }))} />
              </Group>
              <Group title="Opportunity Description" th="รายละเอียดโอกาส">
                <textarea className="vf-textarea lg" value={opp.description} onChange={(e) => setOpp(o => ({ ...o, description: e.target.value }))} placeholder="Describe the opportunity, expected value, and key points..." />
              </Group>
            </Section>

            {/* ===== SECTION 5 ===== */}
            <Section id="vf-s5" no={5} title="Action Plan" th="แผนดำเนินงาน" open={!!open['vf-s5']} onToggle={() => toggleSec('vf-s5')}
              status={sIn('vf-s5').state} statusText={sIn('vf-s5').text} summary={sIn('vf-s5').summary}>
              <p className="vf-question">What needs to happen next?<small>ขั้นตอนต่อไปที่ต้องทำคืออะไร</small></p>
              <CheckGroup options={ACTIONS} exclusive={['No Action']} value={plan.actions} onChange={(v) => setPlan(p => ({ ...p, actions: v }))} />
              <Group title="Action Plan Table" th="ตารางแผนดำเนินงาน">
                <div className="vf-plan">
                  <div className="vf-plan-row head">
                    <div>Next Action<small>สิ่งที่ต้องทำ</small></div>
                    <div>Action Owner<small>ผู้รับผิดชอบ</small></div>
                    <div>Customer Contact<small>ผู้ติดต่อฝั่งลูกค้า</small></div>
                    <div>Due Date<small>กำหนดเสร็จ</small></div>
                    <div>Expected Result<small>ผลที่คาดหวัง</small></div>
                    <div />
                  </div>
                  {plan.rows.length === 0 && <div className="vf-empty" style={{ border: 'none', margin: 0 }}>ยังไม่มีรายการ — กด “+ Add Action Row”</div>}
                  {plan.rows.map((r, i) => {
                    const contactNames = contacts.map(c => c.name.trim()).filter(Boolean);
                    const listId = `vf-act-${r.id}`;
                    return (
                      <div className="vf-plan-row" key={r.id}>
                        <div className="vf-plan-cell">
                          <span className="vf-cell-label">Next Action</span>
                          <input type="text" className="vf-input" list={listId} value={r.next_action} onChange={(e) => updRow(r.id, { next_action: e.target.value })} placeholder="e.g. Send datasheet" />
                          <datalist id={listId}>{plan.actions.filter(a => a !== 'No Action').map(a => <option key={a} value={a} />)}</datalist>
                        </div>
                        <div className="vf-plan-cell">
                          <span className="vf-cell-label">Action Owner</span>
                          <select className="vf-select" value={r.owner_id} onChange={(e) => {
                            const u = ownerOptions.find(x => String(x.id) === e.target.value);
                            updRow(r.id, { owner_id: e.target.value, owner_name: u ? u.full_name : '' });
                          }}>
                            <option value="">-- Select --</option>
                            {ownerOptions.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                          </select>
                        </div>
                        <div className="vf-plan-cell">
                          <span className="vf-cell-label">Customer Contact</span>
                          <select className="vf-select" value={r.contact} onChange={(e) => updRow(r.id, { contact: e.target.value })}>
                            <option value="">-- Select --</option>
                            {r.contact && !contactNames.includes(r.contact) && <option value={r.contact}>{r.contact}</option>}
                            {contactNames.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        <div className="vf-plan-cell">
                          <span className="vf-cell-label">Due Date</span>
                          <input type="date" className="vf-input" value={r.due_date} onChange={(e) => updRow(r.id, { due_date: e.target.value })} />
                        </div>
                        <div className="vf-plan-cell">
                          <span className="vf-cell-label">Expected Result</span>
                          <input type="text" className="vf-input" value={r.expected_result} onChange={(e) => updRow(r.id, { expected_result: e.target.value })} />
                        </div>
                        <div className="vf-plan-cell del">
                          <button type="button" className="vf-btn danger sm" onClick={() => delRow(r.id)} aria-label={`Delete action row ${i + 1}`}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="vf-plan-foot"><button type="button" className="vf-btn add" onClick={addRow}>+ Add Action Row</button></div>
                </div>
              </Group>
            </Section>

            {/* ===== SECTION 6 ===== */}
            <Section id="vf-s6" no={6} title="Customer Level" th="ระดับลูกค้า" open={!!open['vf-s6']} onToggle={() => toggleSec('vf-s6')}
              status={sIn('vf-s6').state} statusText={sIn('vf-s6').text} summary={sIn('vf-s6').summary}>
              <div className="vf-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                {selectedCustomer
                  ? <>ระดับปัจจุบันของลูกค้า: <b>{selectedCustomer.level || 'ยังไม่ระบุ'}</b> — ถ้าเลือกระดับอื่นที่ไม่ใช่ "No Change" ระบบจะอัปเดตระดับของลูกค้ารายนี้ให้เมื่อคำขอนี้ได้รับการอนุมัติ</>
                  : 'เลือกลูกค้าก่อน เพื่อดูระดับปัจจุบัน — ถ้าเลือกระดับอื่นที่ไม่ใช่ "No Change" ระบบจะอัปเดตระดับของลูกค้าเมื่อคำขอได้รับการอนุมัติ'}
              </div>
              <RadioCards name="cust_level" options={CUSTOMER_LEVELS} value={level.level} onChange={(v) => setLevel(l => ({ ...l, level: v }))} />
              <div style={{ height: 16 }} />
              <Field label="Reason for Change / Review" th="เหตุผลในการเปลี่ยน / ทบทวนระดับลูกค้า">
                <textarea className="vf-textarea" value={level.reason} onChange={(e) => setLevel(l => ({ ...l, reason: e.target.value }))} placeholder="Why should the level change, or what was reviewed?" />
              </Field>
            </Section>

            {/* ===== SECTION 7 ===== */}
            <Section id="vf-s7" no={7} title="Next Visit" th="การเข้าพบครั้งถัดไป" open={!!open['vf-s7']} onToggle={() => toggleSec('vf-s7')}
              status={sIn('vf-s7').state} statusText={sIn('vf-s7').text} summary={sIn('vf-s7').summary}>
              <Field label="Is a next visit planned?" th="มีแผนเข้าพบครั้งถัดไปหรือไม่">
                <PillRadio name="next_needed" value={next.needed} onChange={(v) => setNext(n => ({ ...n, needed: v }))}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
              </Field>
              {next.needed === 'yes' && (
                <div className="vf-cond">
                  <div className="vf-grid">
                    <Field label="Next Visit Date" th="วันที่เข้าพบครั้งถัดไป">
                      <input type="date" className="vf-input" value={next.date} onChange={(e) => setNext(n => ({ ...n, date: e.target.value }))} />
                    </Field>
                    <Field label="Purpose of Next Visit" th="วัตถุประสงค์การเข้าพบครั้งถัดไป" full>
                      <textarea className="vf-textarea" value={next.purpose} onChange={(e) => setNext(n => ({ ...n, purpose: e.target.value }))} />
                    </Field>
                    <Field label="Expected Outcome" th="ผลลัพธ์ที่คาดหวัง" full>
                      <textarea className="vf-textarea" value={next.expected_outcome} onChange={(e) => setNext(n => ({ ...n, expected_outcome: e.target.value }))} />
                    </Field>
                  </div>
                </div>
              )}
            </Section>

            {/* ===== SECTION 8 ===== */}
            {notesVisible && (
              <Section id="vf-s8" no={8} title="Remark" th="หมายเหตุ" open={!!open['vf-s8']} onToggle={() => toggleSec('vf-s8')}
                status={sIn('vf-s8').state} statusText={sIn('vf-s8').text} summary={sIn('vf-s8').summary}>
                <div className="vf-grid">{renderCore('notes')}</div>
              </Section>
            )}

            {/* ===== SECTION 9 (เฉพาะเมื่อมี Custom Field ที่ไม่มีตำแหน่งวางในฟอร์ม) ===== */}
            {hasExtra && (
              <Section id="vf-s9" no={9} title="Additional Information" th="ข้อมูลเพิ่มเติม (จาก Form Builder)" open={!!open['vf-s9']} onToggle={() => toggleSec('vf-s9')}
                status={sIn('vf-s9').state} statusText={sIn('vf-s9').text}>
                <div className="vf-grid">{anchored('__extra')}</div>
              </Section>
            )}
            {!notesVisible && anchored('notes').length > 0 && <div className="vf-grid">{anchored('notes')}</div>}

            {/* ---------------- Sticky footer action bar ---------------- */}
            <div className="vf-footer">
              <div className="vf-footer-info">
                <span className={`vf-save-dot ${dirty ? (lastSaved ? 'saved' : 'dirty') : lastSaved ? 'saved' : ''}`} />
                <span title="ฉบับร่างอัตโนมัติเก็บไว้ในเบราว์เซอร์ของเครื่องนี้ ส่วน Save Draft จะบันทึกลงระบบ">
                  {lastSaved ? `Draft auto-saved ${relTime(lastSaved, now)}` : dirty ? 'Unsaved changes…' : 'No changes yet'}
                </span>
              </div>
              <div className="vf-footer-actions">
                <button type="button" className="vf-fbtn cancel" onClick={handleCancel} disabled={saving}>Cancel</button>
                {(!editingRequest || editingRequest.status === 'draft') && (
                  <button type="button" className="vf-fbtn" onClick={handleSaveDraft} disabled={saving}>Save Draft</button>
                )}
                <button type="submit" className="vf-fbtn primary" disabled={saving}>
                  {saving ? 'Saving…' : isPostVisitUpdate ? 'Save Changes' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </Layout>
  );
}
