// lib/useFormOptions.js - ตัวเลือกของฟอร์ม Visit ที่ Admin จัดการได้ (โหลดจาก /api/form-options, ใช้ค่าเริ่มต้นระหว่างรอ/ถ้าโหลดไม่ได้)
import { useEffect, useState } from 'react';
import { api } from './api';

export const DEFAULT_OPTIONS = {
  job_type: ['เข้าพบลูกค้า', 'ติดตั้ง/บริการ', 'นำเสนอสินค้า', 'ติดตามงาน', 'ประชุมงาน', 'อื่นๆ'],
  transport: ['รถยนต์ส่วนตัว', 'รถบริษัท', 'รถสาธารณะ', 'แท็กซี่/แอปเรียกรถ', 'อื่นๆ'],
  company: ['TAC', 'FAC', 'HTC'],
  objective: ['Part Opportunity', 'Product Expansion', 'Design-in', 'Replacement / Upgrade', 'Project Opportunity', 'Application Information', 'Customer / Market Information', 'Other'],
  problems: ['Downtime', 'Productivity', 'Quality', 'Manpower', 'Maintenance', 'Safety', 'Energy', 'Obsolete Equipment', 'Other', 'No Current Problem'],
  projects: ['New Machine', 'New Production Line', 'Factory Expansion', 'Automation', 'Replacement / Upgrade', 'Digitalization', 'Other', 'No Known Project'],
  timings: ['Less than 3 Months', '3–6 Months', '6–12 Months', 'More than 12 Months', 'Unknown'],
  potentials: ['Sensor', 'PLC', 'HMI', 'Inverter', 'Servo', 'Motion Control', 'Robot', 'Control Panel', 'Automation', 'Other'],
  found: ['Part Opportunity', 'Product Expansion', 'Design-in', 'Replacement / Upgrade', 'Project Opportunity', 'No Opportunity'],
  actions: ['Send Product Information', 'Technical Discussion', 'Site Survey', 'Demo / Test', 'Product Selection', 'Budgetary Quotation', 'Quotation', 'Project Proposal', 'Follow-up', 'No Action']
};
const DEFAULT_OTHER = { objective: 'Other', problems: 'Other', projects: 'Other', potentials: 'Other' };
const DEFAULT_EXCL = { problems: ['No Current Problem'], projects: ['No Known Project'], found: ['No Opportunity'], actions: ['No Action'] };

const build = (raw) => {
  const lists = {}; const other = {}; const exclusive = {};
  Object.keys(DEFAULT_OPTIONS).forEach((g) => {
    const rows = raw && Array.isArray(raw[g]) ? raw[g] : null;
    if (!rows) { lists[g] = DEFAULT_OPTIONS[g]; other[g] = DEFAULT_OTHER[g] || null; exclusive[g] = DEFAULT_EXCL[g] || []; return; }
    lists[g] = rows.map((r) => r.value);
    const o = rows.find((r) => r.is_other);
    other[g] = o ? o.value : null;
    exclusive[g] = rows.filter((r) => r.is_exclusive).map((r) => r.value);
  });
  return { lists, other, exclusive };
};

let cache = null;
export function useFormOptions() {
  const [opts, setOpts] = useState(() => cache || build(null));
  useEffect(() => {
    let alive = true;
    api.get('/api/form-options').then((r) => { cache = build(r.options); if (alive) setOpts(cache); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return opts;
}
export const clearFormOptionsCache = () => { cache = null; };
