// client/src/pages/AdminApprovalTemplates.jsx - Admin: Template Builder สำหรับระบบอนุมัติแบบ Template-Based Workflow (V1: โมดูล Leave)
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const MODE_OPTIONS = ['ANY', 'ALL'];
// .form-group input{width:100%;padding:...;border:...} ของทั้งเว็บไซต์จะไปโดน checkbox ด้วย (ทำให้กล่องยืดเต็มแถว บีบข้อความข้าง ๆ จนวรรณยุกต์ตัดบรรทัดมั่ว)
// ต้อง reset ค่ากลับเป็นของ checkbox ปกติเฉพาะจุดนี้
const CHECKBOX_STYLE = { width: 16, height: 16, minWidth: 16, flexShrink: 0, padding: 0, border: '1px solid var(--border)', borderRadius: 4, background: '#fff', accentColor: 'var(--blue-500, #2563eb)' };

function UserPicker({ users, selected, onChange }) {
  const [q, setQ] = useState('');
  const filtered = users.filter(u => !q || u.full_name.includes(q) || (u.department || '').includes(q));
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  return (
    <div>
      <input type="text" placeholder="ค้นหาชื่อ/แผนก..." value={q} onChange={e => setQ(e.target.value)}
        style={{ width: '100%', fontSize: 12.5, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 6 }} />
      <div style={{ maxHeight: 170, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 6 }}>
        {filtered.length ? filtered.map(u => (
          <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 2px', fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} style={CHECKBOX_STYLE} />
            <span style={{ flex: 1 }}>{u.full_name}</span>
            <span className="muted" style={{ fontSize: 11 }}>{u.department || '-'}</span>
          </label>
        )) : <div className="muted" style={{ fontSize: 12, padding: 4 }}>ไม่พบผู้ใช้</div>}
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>เลือกแล้ว {selected.length} คน</div>
    </div>
  );
}

export default function AdminApprovalTemplates() {
  const toast = useToast();
  const [templates, setTemplates] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [newName, setNewName] = useState('');
  const [states, setStates] = useState([]);
  const [requesterIds, setRequesterIds] = useState([]);

  const loadList = async () => {
    const { templates } = await api.get('/api/approval-templates?module=leave');
    setTemplates(templates);
  };
  useEffect(() => {
    loadList();
    api.get('/api/users').then(({ users }) => setUsers(users)).catch(() => {});
  }, []);

  const openTemplate = async (id) => {
    setSelectedId(id);
    const { template } = await api.get(`/api/approval-templates/${id}`);
    setDetail(template);
    setRequesterIds(template.requesters.map(r => r.id));
    setStates(template.states.map(s => ({ name: s.name, mode: s.mode, approver_ids: s.approvers.map(a => a.id) })));
  };

  const createTemplate = async () => {
    if (!newName.trim()) { toast('กรุณาระบุชื่อ Template', 'error'); return; }
    try {
      const r = await api.post('/api/approval-templates', { module: 'leave', name: newName.trim() });
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
      setSelectedId(null); setDetail(null);
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

  const addState = () => setStates(s => [...s, { name: '', mode: 'ANY', approver_ids: [] }]);
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
      if (!s.approver_ids.length) { toast(`ขั้นตอน "${s.name || '(ไม่มีชื่อ)'}" ต้องมีผู้อนุมัติอย่างน้อย 1 คน`, 'error'); return; }
    }
    try {
      await api.put(`/api/approval-templates/${selectedId}/states`, { states });
      toast('บันทึกขั้นตอนอนุมัติสำเร็จ', 'success');
      await loadList();
      // ดึงข้อมูลจริงจาก backend มาย้ำเฉพาะส่วน states เท่านั้น
      // (ไม่แตะ requesterIds เพราะถ้ากำลังติ๊ก/ถอนติ๊กผู้ขอค้างอยู่โดยยังไม่กด "บันทึกรายชื่อผู้ขอ"
      //  การ reload ตรงนี้จะไปทับค่าที่ยังไม่ได้บันทึกของ Requester ทิ้งโดยไม่ตั้งใจ — นี่คือจุดที่ทำให้ติ๊กหน้าชื่อ requester หายไปเองตอนกดปุ่มนี้)
      const { template } = await api.get(`/api/approval-templates/${selectedId}`);
      setDetail(d => ({ ...d, states: template.states }));
      setStates(template.states.map(s => ({ name: s.name, mode: s.mode, approver_ids: s.approvers.map(a => a.id) })));
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <Layout title="Template อนุมัติ (Approval Templates)">
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
        กำหนด Workflow การอนุมัติล่วงหน้าเป็น Template — ระบุว่าใครใช้ Template นี้ได้ (Requester), มีกี่ขั้นตอน, และแต่ละขั้นตอนใครอนุมัติได้บ้าง (ANY = คนใดคนหนึ่งพอ, ALL = ต้องครบทุกคน)
        พนักงานที่ไม่มี Template ครอบคลุม จะใช้ระบบเดิม (หัวหน้าแผนกอนุมัติคนเดียวจบ) โดยอัตโนมัติ ไม่ต้องตั้งให้ครบทุกคนก่อนถึงจะใช้งานได้
      </div>
      <div className="grid-2" style={{ alignItems: 'flex-start' }}>
        <div className="card">
          <div className="card-head"><h3>Template ทั้งหมด (โมดูล: การขอลา)</h3></div>
          <div className="card-body">
            <div className="flex gap-8 mb-16">
              <input type="text" placeholder="ชื่อ Template ใหม่ เช่น การขอลาฝ่ายขาย" value={newName} onChange={e => setNewName(e.target.value)}
                style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') createTemplate(); }} />
              <button className="btn btn-primary btn-sm" onClick={createTemplate}>+ สร้าง</button>
            </div>
            {templates === null ? <div className="muted">กำลังโหลด...</div> : templates.length ? (
              <div>
                {templates.map(t => (
                  <div key={t.id} onClick={() => openTemplate(t.id)}
                    style={{
                      padding: '10px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 6,
                      background: selectedId === t.id ? '#eef2ff' : 'transparent', border: '1px solid var(--border)'
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <b style={{ fontSize: 13.5 }}>{t.name}</b>
                      <span className={`badge ${t.is_active ? 'approved' : 'cancelled'}`}>{t.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>ผู้ขอ {t.requester_count} คน · {t.state_count} ขั้นตอน</div>
                  </div>
                ))}
              </div>
            ) : <div className="empty">ยังไม่มี Template — คำขอทั้งหมดจะใช้ระบบเดิม (อิงแผนก)</div>}
          </div>
        </div>

        <div className="card">
          {!detail ? (
            <div className="card-body"><div className="empty">เลือก Template ทางซ้าย หรือสร้างใหม่</div></div>
          ) : (
            <>
              <div className="card-head flex between">
                <h3>{detail.name}</h3>
                <button className="btn btn-danger btn-sm" onClick={removeTemplate}>ลบ Template</button>
              </div>
              <div className="card-body">
                <div className="form-group">
                  <label>ชื่อ Template</label>
                  <div className="flex gap-8">
                    <input value={detail.name} onChange={e => setDetail(d => ({ ...d, name: e.target.value }))} style={{ flex: 1 }} />
                    <button className="btn btn-outline btn-sm" onClick={saveName}>บันทึกชื่อ</button>
                  </div>
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!detail.is_active} onChange={toggleActive} style={CHECKBOX_STYLE} />
                    เปิดใช้งาน Template นี้ (ถ้าปิด requester ในนี้จะตกกลับไปใช้ Template อื่นหรือระบบเดิมแทน)
                  </label>
                </div>

                <div className="form-group">
                  <label>ผู้ที่มีสิทธิ์ใช้ Template นี้ (Requester)</label>
                  <UserPicker users={users} selected={requesterIds} onChange={setRequesterIds} />
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button className={`btn btn-sm ${requesterIdsDirty ? 'btn-primary' : 'btn-outline'}`} onClick={saveRequesters}>บันทึกรายชื่อผู้ขอ</button>
                    {requesterIdsDirty && (
                      <span style={{ fontSize: 11.5, color: '#b45309' }}>
                        ● มีการเปลี่ยนแปลงผู้ขอที่ยังไม่ได้บันทึก — กดปุ่มนี้ก่อน ไม่งั้นจะหายถ้าไปกด "บันทึกขั้นตอนทั้งหมด" ก่อน
                      </span>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>ขั้นตอนการอนุมัติ (เรียงตามลำดับ)</label>
                  {states.map((s, idx) => (
                    <div key={idx} className="card" style={{ marginBottom: 10, background: '#fafbfc' }}>
                      <div className="card-body">
                        <div className="flex gap-8" style={{ alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                          <span className="badge" style={{ background: '#eef0f5' }}>State {idx + 1}</span>
                          <input placeholder="ชื่อขั้นตอน เช่น หัวหน้าแผนกอนุมัติ" value={s.name}
                            onChange={e => updateState(idx, { name: e.target.value })} style={{ flex: 1, fontSize: 13, minWidth: 160 }} />
                          <select value={s.mode} onChange={e => updateState(idx, { mode: e.target.value })} style={{ fontSize: 12.5 }}>
                            {MODE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <button className="btn btn-outline btn-sm" disabled={idx === 0} onClick={() => moveState(idx, -1)}>↑</button>
                          <button className="btn btn-outline btn-sm" disabled={idx === states.length - 1} onClick={() => moveState(idx, 1)}>↓</button>
                          <button className="btn btn-danger btn-sm" onClick={() => removeState(idx)}>ลบ</button>
                        </div>
                        <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                          {s.mode === 'ALL' ? 'ต้องอนุมัติครบทุกคนที่เลือกไว้ State นี้ถึงจะผ่าน' : 'อนุมัติคนใดคนหนึ่งพอ State นี้ก็ผ่านทันที'}
                        </div>
                        <UserPicker users={users} selected={s.approver_ids} onChange={ids => updateState(idx, { approver_ids: ids })} />
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-8">
                    <button className="btn btn-outline btn-sm" onClick={addState}>+ เพิ่มขั้นตอน</button>
                    <button className="btn btn-primary btn-sm" onClick={saveStates}>บันทึกขั้นตอนทั้งหมด</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
