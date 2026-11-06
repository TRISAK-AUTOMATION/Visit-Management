// components/FormOptionsEditor.jsx - Admin: เพิ่ม/ลบ/แก้ไข/จัดลำดับ/ปิดใช้ ตัวเลือกของฟอร์ม Visit (หัวข้อ 1–8)
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { clearFormOptionsCache } from '../lib/useFormOptions';
import Loading from './Loading';

export default function FormOptionsEditor() {
  const toast = useToast();
  const [groups, setGroups] = useState(null);
  const [adding, setAdding] = useState({});
  const [editing, setEditing] = useState(null); // {id, value}
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const r = await api.get('/api/form-options/admin'); setGroups(r.groups); }
    catch (e) { toast(e.message, 'error'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); clearFormOptionsCache(); if (okMsg) toast(okMsg, 'success'); await load(); }
    catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const add = (g) => run(async () => {
    await api.post('/api/form-options', { group_key: g.key, value: adding[g.key] || '' });
    setAdding(a => ({ ...a, [g.key]: '' }));
  }, 'เพิ่มตัวเลือกแล้ว');
  const patch = (it, body, msg) => run(() => api.patch(`/api/form-options/${it.id}`, body), msg);
  const del = (it) => { if (window.confirm(`ลบตัวเลือก "${it.value}" ?\n(คำขอเก่าที่เลือกไว้ยังเก็บข้อความเดิมไว้ ไม่หาย)`)) run(() => api.del(`/api/form-options/${it.id}`), 'ลบแล้ว'); };
  const move = (g, idx, dir) => {
    const ids = g.items.map(i => i.id); const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    run(() => api.patch('/api/form-options/reorder', { group_key: g.key, order: ids }));
  };

  if (!groups) return <Loading />;
  const mini = { padding: '2px 8px', fontSize: 12 };
  return (
    <div>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
        จัดการตัวเลือกในหัวข้อ 1–8 ของฟอร์ม Visit: เพิ่ม / แก้ชื่อ / ลบ / เรียงลำดับ / ปิดใช้ชั่วคราว ได้ทุกกลุ่ม มีผลทันทีกับคำขอใหม่ —
        คำขอเก่าเก็บข้อความที่เลือกไว้เดิม ไม่เปลี่ยนตาม<br />
        <b>Other</b> = ติ๊กแล้วมีช่องกรอกข้อความเพิ่ม · <b>ตัวเดียว</b> = ติ๊กแล้วล้างตัวเลือกอื่น (เช่น No Action) ·
        ชื่อหัวข้อและหัวข้อย่อย แก้/ซ่อนได้ที่ Settings &rsaquo; จัดการหน้า/หัวข้อ
      </p>
      {groups.map(g => (
        <div className="card mb-16" key={g.key}>
          <div className="card-body">
            <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>{g.title}</h3>
            {g.items.length === 0 && <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>ยังไม่มีตัวเลือก</div>}
            {g.items.map((it, idx) => (
              <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #eef1f8', opacity: it.is_active ? 1 : 0.5, flexWrap: 'wrap' }}>
                <span style={{ width: 22, color: '#8a93a8', fontSize: 12 }}>{idx + 1}</span>
                {editing && editing.id === it.id ? (
                  <input autoFocus value={editing.value} maxLength={80} onChange={(e) => setEditing({ id: it.id, value: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { patch(it, { value: editing.value }, 'บันทึกแล้ว'); setEditing(null); } if (e.key === 'Escape') setEditing(null); }}
                    style={{ flex: 1, minWidth: 160, padding: '5px 9px', border: '1px solid var(--border)', borderRadius: 8 }} />
                ) : <b style={{ flex: 1, minWidth: 160, fontWeight: 600 }}>{it.value}{!it.is_active && <span className="muted" style={{ fontWeight: 400 }}> (ปิดใช้)</span>}</b>}
                <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center', fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto' }} checked={it.is_other} disabled={busy} onChange={(e) => patch(it, { is_other: e.target.checked })} />Other</label>
                {['objective', 'problems', 'projects', 'found', 'actions'].includes(g.key) &&
                  <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center', fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto' }} checked={it.is_exclusive} disabled={busy} onChange={(e) => patch(it, { is_exclusive: e.target.checked })} />ตัวเดียว</label>}
                <button type="button" className="btn btn-outline" style={mini} disabled={busy || idx === 0} onClick={() => move(g, idx, -1)}>↑</button>
                <button type="button" className="btn btn-outline" style={mini} disabled={busy || idx === g.items.length - 1} onClick={() => move(g, idx, 1)}>↓</button>
                {editing && editing.id === it.id
                  ? <button type="button" className="btn btn-primary" style={mini} disabled={busy} onClick={() => { patch(it, { value: editing.value }, 'บันทึกแล้ว'); setEditing(null); }}>บันทึก</button>
                  : <button type="button" className="btn btn-outline" style={mini} onClick={() => setEditing({ id: it.id, value: it.value })}>แก้ชื่อ</button>}
                <button type="button" className="btn btn-outline" style={mini} disabled={busy} onClick={() => patch(it, { is_active: !it.is_active })}>{it.is_active ? 'ปิดใช้' : 'เปิดใช้'}</button>
                <button type="button" className="btn btn-outline" style={{ ...mini, color: '#c0281f' }} disabled={busy} onClick={() => del(it)}>ลบ</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input placeholder="ชื่อตัวเลือกใหม่" value={adding[g.key] || ''} maxLength={80} onChange={(e) => setAdding(a => ({ ...a, [g.key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') add(g); }} style={{ flex: 1, padding: '7px 11px', border: '1px solid var(--border)', borderRadius: 8 }} />
              <button type="button" className="btn btn-primary btn-sm" disabled={busy || !(adding[g.key] || '').trim()} onClick={() => add(g)}>+ เพิ่ม</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
