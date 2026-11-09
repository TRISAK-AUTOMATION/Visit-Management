// client/src/pages/AdminApprovalTemplates.jsx - Admin: Template Builder สำหรับระบบอนุมัติแบบ Template-Based Workflow (ลา / OT / Visit / หัวหน้าแผนก)
// ดีไซน์ใหม่: Hero + แท็บโมดูล -> การ์ด Template เป็นกริดเต็มความกว้าง -> คลิกเพื่อแก้ไขในป๊อปอัพ (ใช้สไตล์กลางเดียวกับ Dashboard/Report: components/ui-kit.css)
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import PageHero from '../components/PageHero';
import PopupModal from '../components/PopupModal';
import RIcon from '../components/report/ReportIcons';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import '../components/ui-kit.css';

const MODE_OPTIONS = ['ANY', 'ALL'];
const MODULE_TABS = [
  { v: 'leave', label: 'การลา', icon: 'umbrella', tone: 'green' },
  { v: 'ot', label: 'OT', icon: 'clock', tone: 'orange' },
  { v: 'visit', label: 'Visit (ออกนอกสถานที่)', short: 'Visit', icon: 'car', tone: 'blue' },
  { v: 'heads', label: 'หัวหน้าแผนก', icon: 'badge', tone: 'purple' },
];
// ช่องลงนามบนเอกสาร PDF ของแต่ละโมดูล (Visit ไม่มี)
const SLOT_OPTIONS = {
  leave: [['head', 'หัวหน้า'], ['approver', 'ผู้อนุมัติ']],
  ot: [['checker', 'ผู้ตรวจสอบ'], ['approver', 'ผู้อนุมัติ']],
};
const SLOT_LABEL = { head: 'หัวหน้า', checker: 'ผู้ตรวจสอบ', approver: 'ผู้อนุมัติ' };

// ---------- อวาตาร์ตัวอักษร (สีคงที่ตามชื่อ) ----------
const PAL = [['#2f5bff', '#6c93ff'], ['#17a35c', '#52d38f'], ['#f08a00', '#ffc15e'], ['#6d4cf0', '#a28dff'], ['#e5483e', '#ff8b83'], ['#0891b2', '#38c1de']];
const initials = (name = '') => {
  const p = name.trim().split(/\s+/);
  if (p.length > 1 && /^[A-Za-z]/.test(p[0])) return (p[0][0] + p[1][0]).toUpperCase();
  return (p[0].replace(/^[เแโใไ]+/, '').slice(0, 1) || '?').toUpperCase();
};
const Avatar = ({ name = '', id = 0 }) => {
  const [a, b] = PAL[(Math.abs(Number(id) || 0) + name.length) % PAL.length];
  return <span className="ux-av" style={{ '--av1': a, '--av2': b }}>{initials(name)}</span>;
};

const Chip = ({ user, fallback, onRemove }) => (
  <span className="ux-chip">
    <Avatar name={user?.full_name || fallback} id={user?.id} />
    {user?.full_name || fallback}
    {onRemove && <button type="button" onClick={onRemove} aria-label={`เอา ${user?.full_name || fallback} ออก`}>×</button>}
  </span>
);

// ตัวเลือกผู้ใช้: ค้นหา + เลือกทั้งหมด/ล้าง + เลือกทั้งแผนก + แสดงคนที่เลือกเป็น chip (กด × เอาออกได้)
function UserPicker({ users, selected, onChange, maxList = 200 }) {
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const filtered = users.filter(u => !ql || u.full_name.toLowerCase().includes(ql) || (u.department || '').toLowerCase().includes(ql));
  const depts = [...new Set(users.map(u => u.department).filter(Boolean))].sort();
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  const addMany = (ids) => onChange([...new Set([...selected, ...ids])]);
  const removeMany = (ids) => onChange(selected.filter(x => !ids.includes(x)));
  const toggleDept = (d) => {
    const ids = users.filter(u => u.department === d).map(u => u.id);
    ids.every(id => selected.includes(id)) ? removeMany(ids) : addMany(ids);
  };
  const byId = new Map(users.map(u => [u.id, u]));
  const pct = users.length ? Math.round((selected.length / users.length) * 100) : 0;
  return (
    <div className="ux-picker">
      <div className="ux-row">
        <label className="ux-search">
          <RIcon name="search" size={16} />
          <input type="text" className="ux-input" placeholder="ค้นหาชื่อ/แผนก..." value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <button type="button" className="ux-btn soft sm" onClick={() => addMany(filtered.map(u => u.id))}>
          <RIcon name="check" size={14} /> เลือกทั้งหมด{ql ? ' (ที่ค้นหา)' : ''}
        </button>
        <button type="button" className="ux-btn ghost sm" onClick={() => removeMany(filtered.map(u => u.id))}>ล้าง</button>
      </div>
      {depts.length > 1 && (
        <div className="ux-depts">
          <span>เลือกทั้งแผนก:</span>
          {depts.map(d => {
            const ids = users.filter(u => u.department === d).map(u => u.id);
            const n = ids.filter(id => selected.includes(id)).length;
            return (
              <button type="button" key={d} className={`ux-dept ${n === ids.length ? 'all' : n ? 'part' : ''}`} onClick={() => toggleDept(d)}>
                {d} {n}/{ids.length}
              </button>
            );
          })}
        </div>
      )}
      {selected.length > 0 && (
        <div className="ux-chips">
          {selected.map(id => <Chip key={id} user={byId.get(id)} fallback={`#${id}`} onRemove={() => toggle(id)} />)}
        </div>
      )}
      <div className="ux-list" style={{ '--maxh': `${maxList}px` }}>
        {filtered.length ? filtered.map(u => (
          <label key={u.id} className={`ux-opt ${selected.includes(u.id) ? 'on' : ''}`}>
            <input type="checkbox" className="ux-cb" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
            <Avatar name={u.full_name} id={u.id} />
            <span className="nm">{u.full_name}</span>
            <span className="dp">{u.department || '-'}</span>
          </label>
        )) : <div className="muted" style={{ fontSize: 12.5, padding: 12, textAlign: 'center' }}>ไม่พบผู้ใช้</div>}
      </div>
      <div className="ux-count">
        <span>เลือกแล้ว <b>{selected.length}</b> / {users.length} คน</span>
        <span className="ux-bar"><i style={{ width: `${pct}%` }} /></span>
      </div>
    </div>
  );
}

// ภาพรวมลำดับการอนุมัติ: ผู้ขอ → ขั้นที่ 1 → ขั้นที่ 2 ...
function Flow({ states, module }) {
  const hasSlot = !!SLOT_OPTIONS[module];
  return (
    <div className="ux-flow">
      <div className="ux-flow-label">ลำดับการอนุมัติ</div>
      <span className="ux-node" style={{ '--i': 0 }}><RIcon name="user" size={13} /> ผู้ขอ</span>
      {states.map((s, i) => (
        <React.Fragment key={i}>
          <span className="ux-arrow">→</span>
          <span className={`ux-node ${s.slot === 'approver' || (!hasSlot && i === states.length - 1) ? 'final' : 'step'}`} style={{ '--i': i + 1 }}>
            {s.name || '(ยังไม่ตั้งชื่อ)'}
            {s.approver_source === 'dept_head' ? ' · หัวหน้าตามแผนกผู้ขอ' : ` · ${s.approver_ids.length} คน`}
            {hasSlot && s.slot ? ` · ลงช่อง "${SLOT_LABEL[s.slot]}"` : ''}
          </span>
        </React.Fragment>
      ))}
      {states.some(s => s.approver_source === 'dept_head') && (
        <div className="ux-note">ถ้าแผนกของผู้ขอยังไม่มีหัวหน้า (หรือผู้ขอเป็นหัวหน้าเอง) ระบบจะข้ามขั้นหัวหน้า แล้วให้ผู้อนุมัติอนุมัติคนเดียว</div>
      )}
    </div>
  );
}

// แท็บ "หัวหน้าแผนก": ตั้งว่าแต่ละแผนกใครเป็นหัวหน้า (ใช้กับขั้นตอนแบบ "หัวหน้าตามแผนกผู้ขอ")
function DeptHeads({ users, rows, reload, toast }) {
  const [sel, setSel] = useState(null);
  const [ids, setIds] = useState([]);
  const nameOf = (id) => users.find(u => u.id === id);
  const open = (d) => { setSel(d.department); setIds(d.user_ids); };
  const current = rows?.find(d => d.department === sel);
  const dirty = !!current && [...ids].sort().join(',') !== [...current.user_ids].sort().join(',');
  const save = async () => {
    try {
      await api.put('/api/approval-templates/department-heads', { department: sel, user_ids: ids });
      toast(`บันทึกหัวหน้าแผนก ${sel} แล้ว`, 'success');
      await reload();
      setSel(null);
    } catch (err) { toast(err.message, 'error'); }
  };
  const sorted = [...users].sort((a, b) => (a.department === sel ? 0 : 1) - (b.department === sel ? 0 : 1) || a.full_name.localeCompare(b.full_name));

  return (
    <>
      <div className="ux-sechead">
        <h3>แผนกทั้งหมด <span className="muted">คลิกการ์ดเพื่อกำหนดหัวหน้า</span></h3>
      </div>
      {rows === null ? (
        <div className="ux-grid">{[0, 1, 2].map(i => <span key={i} className="rx-skel" style={{ height: 132, borderRadius: 16 }} />)}</div>
      ) : rows.length ? (
        <div className="ux-grid">
          {rows.map((d, i) => {
            const count = users.filter(u => u.department === d.department).length;
            return (
              <div key={d.department} role="button" tabIndex={0} className="ux-tcard tone-purple ux-rise" style={{ '--i': i }}
                onClick={() => open(d)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(d); } }}>
                <div className="ux-trow">
                  <span className="ux-tico"><RIcon name="building" size={22} /></span>
                  <div className="ux-tname"><b>{d.department}</b><small>พนักงาน {count} คน</small></div>
                  {d.user_ids.length > 0 && <span className="ux-status"><span className="ux-dot" />มีหัวหน้า</span>}
                </div>
                <div className="ux-chips" style={{ maxHeight: 64 }}>
                  {d.user_ids.length
                    ? d.user_ids.map(id => <Chip key={id} user={nameOf(id)} fallback={`#${id}`} />)
                    : <span className="ux-pill" style={{ background: '#fff7e6', color: '#b45309' }}><RIcon name="warn" size={13} /> ยังไม่ได้ตั้งหัวหน้า</span>}
                </div>
                <span className="ux-tgo">ตั้งค่า →</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ux-empty"><span className="ico"><RIcon name="building" size={30} /></span><b>ยังไม่มีแผนก</b><span>เพิ่มแผนกให้ผู้ใช้งานก่อนที่หน้าจัดการผู้ใช้งาน แล้วกลับมากำหนดหัวหน้าได้ที่นี่</span></div>
      )}

      {sel && (
        <PopupModal title={`หัวหน้าแผนก ${sel}`} subtitle="ตั้งได้หลายคน — ใครคนใดคนหนึ่งอนุมัติก็ผ่าน" icon="badge" tone="purple" width={760}
          onClose={() => setSel(null)} canClose={() => !dirty || confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการปิดโดยไม่บันทึกหรือไม่?')}
          footer={<>
            {dirty && <span className="ux-dirty" style={{ marginRight: 'auto' }}>มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>}
            <button type="button" className="ux-btn primary" onClick={save}><RIcon name="save" size={16} /> บันทึกหัวหน้าแผนก</button>
          </>}>
          <div className="ux-sec" style={{ '--i': 0 }}>
            <div className="ux-sec-head">
              <span className="ux-sec-ico"><RIcon name="users" size={18} /></span>
              <div className="grow"><h4>เลือกหัวหน้า</h4><small>ผู้ใช้ในแผนกนี้จะอยู่ด้านบนของรายการ</small></div>
            </div>
            <div className="ux-tip" style={{ marginTop: 0, marginBottom: 14 }}>
              <RIcon name="info" size={16} />
              <span>พนักงานแผนกนี้ที่ใช้ขั้นตอนแบบ <b>"หัวหน้าตามแผนกผู้ขอ"</b> จะส่งคำขอให้หัวหน้าชุดนี้อนุมัติ</span>
            </div>
            <UserPicker users={sorted} selected={ids} onChange={setIds} maxList={300} />
          </div>
        </PopupModal>
      )}
    </>
  );
}

// ขั้นตอนที่ยังไม่ได้ตั้งช่องลงนาม (slot ว่าง เช่น Template เก่า) -> แสดง/บันทึกเป็นช่องตามตำแหน่ง ให้ตรงกับที่ PDF ใช้จริง
// (ขั้นสุดท้าย = ผู้อนุมัติ, ขั้นก่อนหน้า = ช่องแรก) ไม่งั้น <select> จะโชว์ตัวเลือกแรกทั้งที่ค่าจริงว่าง
const defaultSlot = (module, i, n) => (SLOT_OPTIONS[module] ? (i === n - 1 ? 'approver' : SLOT_OPTIONS[module][0][0]) : '');
const toEditState = (module) => (s, i, arr) => ({ name: s.name, mode: s.mode, slot: s.slot || defaultSlot(module, i, arr.length), approver_source: s.approver_source || 'manual', approver_ids: s.approvers.map(a => a.id) });

export default function AdminApprovalTemplates() {
  const toast = useToast();
  const [module, setModule] = useState('leave');
  const [templates, setTemplates] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [newName, setNewName] = useState('');
  const [states, setStates] = useState([]);
  const [requesterIds, setRequesterIds] = useState([]);
  const [deptHeads, setDeptHeads] = useState(null);

  const mod = MODULE_TABS.find(t => t.v === module);
  const loadDeptHeads = async () => {
    const r = await api.get('/api/approval-templates/department-heads');
    setDeptHeads(r.departments);
  };
  const loadList = async (m = module) => {
    const { templates } = await api.get(`/api/approval-templates?module=${m}`);
    setTemplates(templates);
  };
  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    if (module === 'heads') return;
    setTemplates(null);
    loadList(module).catch(() => setTemplates([]));
  }, [module]);
  useEffect(() => {
    api.get('/api/users').then(({ users }) => setUsers(users)).catch(() => {});
    loadDeptHeads().catch(() => setDeptHeads([]));
  }, []);

  const openTemplate = async (id) => {
    try {
      const { template } = await api.get(`/api/approval-templates/${id}`);
      setSelectedId(id);
      setDetail(template);
      setRequesterIds(template.requesters.map(r => r.id));
      setStates(template.states.map(toEditState(module)));
    } catch (err) { toast(err.message, 'error'); }
  };
  const closeTemplate = () => { setSelectedId(null); setDetail(null); };

  const createTemplate = async () => {
    if (!newName.trim()) { toast('กรุณาระบุชื่อ Template', 'error'); return; }
    try {
      const r = await api.post('/api/approval-templates', { module, name: newName.trim() });
      setNewName('');
      toast('สร้าง Template สำเร็จ กรุณาเพิ่มผู้ขอและขั้นตอนอนุมัติต่อ', 'success');
      await loadList();
      openTemplate(r.id);
    } catch (err) { toast(err.message, 'error'); }
  };

  const saveName = async () => {
    try {
      await api.put(`/api/approval-templates/${selectedId}`, { name: detail.name, is_active: detail.is_active });
      toast('บันทึกแล้ว', 'success');
      loadList();
    } catch (err) { toast(err.message, 'error'); }
  };

  const toggleActive = async () => {
    const next = detail.is_active ? 0 : 1;
    try {
      await api.put(`/api/approval-templates/${selectedId}`, { name: detail.name, is_active: next });
      setDetail(d => ({ ...d, is_active: next }));
      loadList();
    } catch (err) { toast(err.message, 'error'); }
  };

  const removeTemplate = async () => {
    if (!confirm(`ยืนยันลบ Template "${detail.name}"?\n\nคำขอที่กำลังวิ่งอยู่ด้วย Template นี้จะไม่ถูกกระทบ (workflow ของแต่ละคำขอถูกคัดลอกแยกไว้แล้ว) แต่คำขอใหม่จะไม่ใช้ Template นี้อีกต่อไป`)) return;
    try {
      await api.del(`/api/approval-templates/${selectedId}`);
      toast('ลบ Template แล้ว', 'success');
      closeTemplate();
      loadList();
    } catch (err) { toast(err.message, 'error'); }
  };

  const saveRequesters = async () => {
    try {
      await api.put(`/api/approval-templates/${selectedId}/requesters`, { user_ids: requesterIds });
      toast('บันทึกรายชื่อผู้ขอสำเร็จ', 'success');
      await loadList();
      // ดึงข้อมูลจริงจาก backend มาย้ำเฉพาะส่วน requesters ให้ checkbox ตรงกับที่บันทึกจริงเสมอ
      // (ไม่แตะ states เพราะถ้ากำลังแก้ State ค้างอยู่โดยยังไม่กดบันทึก การ reload ตรงนี้จะไปทับข้อมูลที่ยังไม่ได้บันทึกของ State ทิ้งโดยไม่ตั้งใจ)
      const { template } = await api.get(`/api/approval-templates/${selectedId}`);
      setDetail(d => ({ ...d, requesters: template.requesters }));
      setRequesterIds(template.requesters.map(r => r.id));
    } catch (err) { toast(err.message, 'error'); }
  };

  // มีการติ๊ก/ถอนติ๊กผู้ขอค้างอยู่ที่ยังไม่ได้กด "บันทึกรายชื่อผู้ขอ" หรือไม่ (เทียบกับค่าล่าสุดที่ยืนยันว่าบันทึกจริงจาก backend แล้ว)
  const requesterIdsDirty = !!detail && (
    requesterIds.length !== detail.requesters.length ||
    [...requesterIds].sort().join(',') !== detail.requesters.map(r => r.id).sort().join(',')
  );
  // ขั้นตอนที่แก้ไขค้างอยู่ (เทียบกับที่บันทึกไว้ล่าสุด)
  const statesDirty = !!detail && JSON.stringify(states) !== JSON.stringify(detail.states.map(toEditState(module)));
  const listName = templates?.find(t => t.id === selectedId)?.name;
  const nameDirty = !!detail && listName !== undefined && detail.name !== listName;
  const anyDirty = requesterIdsDirty || statesDirty || nameDirty;

  const hasSlots = !!SLOT_OPTIONS[module];
  const addState = () => setStates(s => [...s, { name: '', mode: 'ANY', slot: hasSlots ? 'approver' : '', approver_source: 'manual', approver_ids: [] }]);
  // รูปแบบมาตรฐาน: หัวหน้า/ผู้ตรวจสอบตามแผนกผู้ขอ → ผู้อนุมัติ (เลือกรายชื่อเอง)
  const quickStart = () => setStates([
    { name: module === 'ot' ? 'ผู้ตรวจสอบ (หัวหน้าแผนก)' : 'หัวหน้าแผนก', mode: 'ANY', slot: module === 'ot' ? 'checker' : 'head', approver_source: 'dept_head', approver_ids: [] },
    { name: 'ผู้อนุมัติ', mode: 'ANY', slot: 'approver', approver_source: 'manual', approver_ids: [] }
  ]);
  const removeState = (idx) => setStates(s => s.filter((_, i) => i !== idx));
  const moveState = (idx, dir) => setStates(s => {
    const arr = [...s]; const j = idx + dir;
    if (j < 0 || j >= arr.length) return arr;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    return arr;
  });
  const updateState = (idx, patch) => setStates(s => s.map((st, i) => i === idx ? { ...st, ...patch } : st));

  const saveStates = async () => {
    if (!states.length) { toast('ต้องมีอย่างน้อย 1 ขั้นตอนอนุมัติ', 'error'); return; }
    for (const s of states) {
      if (!s.name.trim()) { toast('กรุณาระบุชื่อทุกขั้นตอน', 'error'); return; }
      if (s.approver_source !== 'dept_head' && !s.approver_ids.length) { toast(`ขั้นตอน "${s.name || '(ไม่มีชื่อ)'}" ต้องมีผู้อนุมัติอย่างน้อย 1 คน`, 'error'); return; }
    }
    if (!states.some(s => s.approver_source !== 'dept_head')) { toast('ต้องมีอย่างน้อย 1 ขั้นที่เลือกรายชื่อผู้อนุมัติเอง (ใช้อนุมัติเมื่อแผนกไหนไม่มีหัวหน้า)', 'error'); return; }
    try {
      await api.put(`/api/approval-templates/${selectedId}/states`, { states });
      toast('บันทึกขั้นตอนอนุมัติสำเร็จ', 'success');
      await loadList();
      // ดึงข้อมูลจริงจาก backend มาย้ำเฉพาะส่วน states เท่านั้น
      // (ไม่แตะ requesterIds เพราะถ้ากำลังติ๊ก/ถอนติ๊กผู้ขอค้างอยู่โดยยังไม่กด "บันทึกรายชื่อผู้ขอ"
      //  การ reload ตรงนี้จะไปทับค่าที่ยังไม่ได้บันทึกของ Requester ทิ้งโดยไม่ตั้งใจ)
      const { template } = await api.get(`/api/approval-templates/${selectedId}`);
      setDetail(d => ({ ...d, states: template.states }));
      setStates(template.states.map(toEditState(module)));
    } catch (err) { toast(err.message, 'error'); }
  };

  // ---------- สรุปตัวเลขบน Hero ----------
  const heroStats = module === 'heads'
    ? (deptHeads ? [{ label: 'แผนก', value: deptHeads.length }, { label: 'ยังไม่มีหัวหน้า', value: deptHeads.filter(d => !d.user_ids.length).length }] : [])
    : (templates ? [{ label: 'Template', value: templates.length }, { label: 'ใช้งานอยู่', value: templates.filter(t => t.is_active).length }] : []);

  return (
    <Layout title="Template อนุมัติ (Approval Templates)">
      <PageHero icon="layers" tone={mod.tone} title="Template อนุมัติ" stats={heroStats}
        desc="กำหนด Workflow การอนุมัติล่วงหน้า — ใครใช้ Template ได้, มีกี่ขั้นตอน, ใครอนุมัติ และให้ชื่อไปลงช่องไหนบนเอกสาร PDF">
        <div className="rx-seg ux-hero-seg" role="tablist" aria-label="เลือกโมดูล">
          {MODULE_TABS.map(t => (
            <button key={t.v} type="button" role="tab" aria-selected={module === t.v} className={module === t.v ? 'on' : ''} onClick={() => setModule(t.v)}>
              <RIcon name={t.icon} size={15} />{t.short || t.label}
            </button>
          ))}
        </div>
      </PageHero>

      <div className="ux-tip rx-rise" style={{ '--i': 1 }}>
        <RIcon name="info" size={16} />
        <span>
          <b>ANY</b> = คนใดคนหนึ่งอนุมัติก็พอ · <b>ALL</b> = ต้องอนุมัติครบทุกคน — พนักงานที่ไม่มี Template ครอบคลุมจะใช้ระบบเดิม (หัวหน้าแผนกอนุมัติคนเดียวจบ) โดยอัตโนมัติ
          ไม่ต้องตั้งให้ครบทุกคนก่อนถึงจะใช้งานได้
        </span>
      </div>

      {module === 'heads' ? <DeptHeads users={users} rows={deptHeads} reload={loadDeptHeads} toast={toast} /> : (
        <>
          <div className="ux-sechead">
            <h3>Template ทั้งหมด <span className="muted">โมดูล: {mod.label}</span></h3>
          </div>
          <div className="ux-grid" key={module}>
            <div className="ux-new ux-rise" style={{ '--i': 0 }}>
              <div className="ux-new-head"><span><RIcon name="plus" size={18} /></span>สร้าง Template ใหม่</div>
              <div className="ux-new-row">
                <input type="text" className="ux-input" placeholder="ตั้งชื่อ Template ใหม่" value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createTemplate(); }} />
                <button type="button" className="ux-btn primary" onClick={createTemplate}>สร้าง</button>
              </div>
            </div>

            {templates === null
              ? [0, 1].map(i => <span key={i} className="rx-skel" style={{ height: 156, borderRadius: 16 }} />)
              : templates.map((t, i) => (
                <div key={t.id} role="button" tabIndex={0} className={`ux-tcard tone-${mod.tone} ux-rise ${t.is_active ? '' : 'off'} ${selectedId === t.id ? 'sel' : ''}`} style={{ '--i': i + 1 }}
                  onClick={() => openTemplate(t.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTemplate(t.id); } }}>
                  <div className="ux-trow">
                    <span className="ux-tico"><RIcon name={mod.icon} size={22} /></span>
                    <div className="ux-tname"><b title={t.name}>{t.name}</b><small>{mod.label}</small></div>
                    <span className={`ux-status ${t.is_active ? '' : 'off'}`}><span className={`ux-dot ${t.is_active ? '' : 'off'}`} />{t.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</span>
                  </div>
                  <div className="ux-meta">
                    <span className="ux-pill"><RIcon name="users" size={13} /> ผู้ขอ {t.requester_count} คน</span>
                    <span className="ux-pill gray"><RIcon name="flow" size={13} /> {t.state_count} ขั้นตอน</span>
                  </div>
                  <div className="ux-steps-mini">
                    {t.state_count > 0 ? (
                      <>
                        {Array.from({ length: Math.min(t.state_count, 5) }).map((_, k) => (
                          <React.Fragment key={k}>{k > 0 && <s />}<i>{k + 1}</i></React.Fragment>
                        ))}
                        {t.state_count > 5 && <em>+{t.state_count - 5}</em>}
                      </>
                    ) : <span className="ux-pill" style={{ background: '#fff7e6', color: '#b45309' }}><RIcon name="warn" size={13} /> ยังไม่ได้ตั้งขั้นตอน</span>}
                  </div>
                  <span className="ux-tgo">แก้ไข →</span>
                </div>
              ))}
          </div>
          {templates !== null && templates.length === 0 && (
            <div className="ux-empty ux-rise" style={{ '--i': 2, marginTop: 16 }}>
              <span className="ico"><RIcon name="layers" size={30} /></span>
              <b>ยังไม่มี Template ในโมดูลนี้</b>
              <span>คำขอทั้งหมดจะใช้ระบบเดิม (อิงแผนก) — สร้าง Template แรกจากการ์ดด้านบนได้เลย</span>
            </div>
          )}
        </>
      )}

      {detail && (
        <PopupModal
          title={detail.name || 'Template'} icon={mod.icon} tone={mod.tone} onClose={closeTemplate}
          subtitle={`โมดูล ${mod.label} · ผู้ขอ ${requesterIds.length} คน · ${states.length} ขั้นตอน`}
          canClose={() => !anyDirty || confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการปิดโดยไม่บันทึกหรือไม่?')}
          actions={
            <>
              <span className={`ux-status ${detail.is_active ? '' : 'off'}`}><span className={`ux-dot ${detail.is_active ? '' : 'off'}`} />{detail.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</span>
              <button type="button" className="ux-btn danger sm" onClick={removeTemplate}><RIcon name="trash" size={14} /> ลบ Template</button>
            </>
          }>
          <div className="ux-cols">
            <div>
              <section className="ux-sec" style={{ '--i': 0 }}>
                <div className="ux-sec-head">
                  <span className="ux-sec-ico"><RIcon name="edit" size={17} /></span>
                  <div className="grow"><h4>ข้อมูลทั่วไป</h4><small>ชื่อและสถานะการใช้งาน</small></div>
                  {nameDirty && <span className="ux-dirty">ยังไม่บันทึกชื่อ</span>}
                </div>
                <label className="ux-label" htmlFor="tpl-name">ชื่อ Template</label>
                <div className="ux-row" style={{ flexWrap: 'nowrap' }}>
                  <input id="tpl-name" className="ux-input" value={detail.name} onChange={e => setDetail(d => ({ ...d, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveName(); }} />
                  <button type="button" className={`ux-btn sm ${nameDirty ? 'primary' : 'ghost'}`} onClick={saveName}>บันทึกชื่อ</button>
                </div>
                <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: detail.is_active ? '#f0fbf5' : '#f6f7fb', border: '1px solid var(--border)', transition: 'background .3s' }}>
                  <label className="ux-switch">
                    <input type="checkbox" checked={!!detail.is_active} onChange={toggleActive} />
                    <span className="trk" />
                    เปิดใช้งาน Template นี้
                  </label>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.55 }}>ถ้าปิด ผู้ขอใน Template นี้จะตกกลับไปใช้ Template อื่นหรือระบบเดิมแทน</div>
                </div>
              </section>

              <section className="ux-sec" style={{ '--i': 1 }}>
                <div className="ux-sec-head">
                  <span className="ux-sec-ico"><RIcon name="users" size={17} /></span>
                  <div className="grow"><h4>ผู้ที่มีสิทธิ์ใช้ Template นี้</h4><small>Requester — คนที่ยื่นคำขอแล้วจะวิ่งตาม Template นี้</small></div>
                </div>
                <UserPicker users={users} selected={requesterIds} onChange={setRequesterIds} maxList={230} />
                <div className="ux-actions">
                  <button type="button" className={`ux-btn ${requesterIdsDirty ? 'primary' : 'ghost'}`} onClick={saveRequesters}><RIcon name="save" size={15} /> บันทึกรายชื่อผู้ขอ</button>
                  {requesterIdsDirty && <span className="ux-dirty">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>}
                </div>
                {requesterIdsDirty && <div className="muted" style={{ fontSize: 11.5, marginTop: 8, color: '#b45309' }}>กดบันทึกรายชื่อผู้ขอก่อน ไม่งั้นรายชื่อจะหายถ้าไปกด "บันทึกขั้นตอนทั้งหมด" ก่อน</div>}
              </section>
            </div>

            <section className="ux-sec" style={{ '--i': 2 }}>
              <div className="ux-sec-head">
                <span className="ux-sec-ico"><RIcon name="flow" size={17} /></span>
                <div className="grow"><h4>ขั้นตอนการอนุมัติ</h4><small>เรียงตามลำดับ — เลื่อนขึ้น/ลงได้</small></div>
                {statesDirty && <span className="ux-dirty">ยังไม่บันทึกขั้นตอน</span>}
              </div>

              {states.length > 0 && <Flow states={states} module={module} />}
              {!states.length && hasSlots && (
                <button type="button" className="ux-addstep" style={{ marginBottom: 12 }} onClick={quickStart}>
                  <RIcon name="bolt" size={16} /> ใช้รูปแบบมาตรฐาน: {module === 'ot' ? 'ผู้ตรวจสอบ (หัวหน้าแผนก)' : 'หัวหน้าแผนก'} → ผู้อนุมัติ
                </button>
              )}
              {!states.length && (
                <div className="muted" style={{ fontSize: 12.5, textAlign: 'center', padding: '14px 0 18px' }}>ยังไม่มีขั้นตอน — กด "เพิ่มขั้นตอน" เพื่อเริ่มต้น</div>
              )}

              <div className="ux-timeline">
                {states.map((s, idx) => {
                  const isHead = s.approver_source === 'dept_head';
                  const reqDepts = [...new Set(users.filter(u => requesterIds.includes(u.id)).map(u => u.department).filter(Boolean))];
                  const noHead = reqDepts.filter(d => !(deptHeads?.find(x => x.department === d)?.user_ids.length));
                  return (
                    <div key={idx} className={`ux-step ${idx === states.length - 1 ? 'final' : ''}`}>
                      <span className="ux-step-no">{idx + 1}</span>
                      <div className="ux-step-card">
                        <div className="ux-step-top">
                          <input className="ux-input" placeholder="ชื่อขั้นตอน เช่น หัวหน้าแผนก" value={s.name} onChange={e => updateState(idx, { name: e.target.value })} aria-label={`ชื่อขั้นตอนที่ ${idx + 1}`} />
                          <button type="button" className="ux-btn ghost icon" disabled={idx === 0} onClick={() => moveState(idx, -1)} aria-label="เลื่อนขึ้น"><RIcon name="arrowUp" size={15} /></button>
                          <button type="button" className="ux-btn ghost icon" disabled={idx === states.length - 1} onClick={() => moveState(idx, 1)} aria-label="เลื่อนลง"><RIcon name="arrowDown" size={15} /></button>
                          <button type="button" className="ux-btn danger icon" onClick={() => removeState(idx)} aria-label="ลบขั้นตอน"><RIcon name="trash" size={15} /></button>
                        </div>
                        <div className="ux-fields">
                          {hasSlots && (
                            <div>
                              <label className="ux-label">ชื่อไปลงช่อง</label>
                              <select className="ux-select" value={s.slot} onChange={e => updateState(idx, { slot: e.target.value })}>
                                {SLOT_OPTIONS[module].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                            </div>
                          )}
                          <div>
                            <label className="ux-label">ผู้อนุมัติ</label>
                            <select className="ux-select" value={s.approver_source} onChange={e => updateState(idx, { approver_source: e.target.value })}>
                              <option value="manual">เลือกรายชื่อเอง</option>
                              <option value="dept_head">หัวหน้าตามแผนกผู้ขอ (อัตโนมัติ)</option>
                            </select>
                          </div>
                          {!isHead && (
                            <div>
                              <label className="ux-label">เงื่อนไข</label>
                              <select className="ux-select" value={s.mode} onChange={e => updateState(idx, { mode: e.target.value })}>
                                {MODE_OPTIONS.map(m => <option key={m} value={m}>{m === 'ANY' ? 'ANY (คนใดคนหนึ่งพอ)' : 'ALL (ครบทุกคน)'}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                        {isHead ? (
                          <div className="ux-callout">
                            ระบบจะส่งให้ <b>หัวหน้าของแผนกที่ผู้ขอสังกัด</b> (ตั้งหัวหน้าได้ที่แท็บ "หัวหน้าแผนก") — ถ้าแผนกไม่มีหัวหน้า หรือผู้ขอเป็นหัวหน้าเอง จะข้ามขั้นนี้ไปที่ขั้นถัดไป
                            {noHead.length > 0 && <div className="warn">⚠ แผนกของผู้ขอที่ยังไม่ตั้งหัวหน้า: {noHead.join(', ')} (คนในแผนกเหล่านี้จะข้ามไปผู้อนุมัติเลย)</div>}
                          </div>
                        ) : (
                          <UserPicker users={users} selected={s.approver_ids} onChange={ids => updateState(idx, { approver_ids: ids })} maxList={170} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button type="button" className="ux-addstep" onClick={addState}><RIcon name="plus" size={16} /> เพิ่มขั้นตอน</button>

              <div className="ux-stickybar">
                <button type="button" className={`ux-btn primary ${statesDirty ? 'pulse' : ''}`} onClick={saveStates}><RIcon name="save" size={15} /> บันทึกขั้นตอนทั้งหมด</button>
                {statesDirty
                  ? <span className="ux-dirty">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>
                  : <span className="muted" style={{ fontSize: 12 }}>ทุกอย่างบันทึกแล้ว</span>}
              </div>
            </section>
          </div>
        </PopupModal>
      )}
    </Layout>
  );
}
