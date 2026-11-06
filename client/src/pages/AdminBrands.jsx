// client/src/pages/AdminBrands.jsx - Brand Master: จัดการรายการยี่ห้อที่ใช้ในฟอร์ม Visit (Current Products / Brands)
import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import PageHero from '../components/PageHero';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';

export default function AdminBrands() {
  const toast = useToast();
  const [brands, setBrands] = useState([]);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null); // { id, name }
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/api/brands/all').then(r => setBrands(r.brands)).catch(e => toast(e.message, 'error'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast(okMsg, 'success'); await load(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const add = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    run(async () => { await api.post('/api/brands', { name: newName }); setNewName(''); }, 'เพิ่มยี่ห้อแล้ว');
  };
  const rename = () => run(async () => { await api.put(`/api/brands/${editing.id}`, { name: editing.name }); setEditing(null); }, 'บันทึกชื่อแล้ว');
  const toggle = (b) => run(() => api.put(`/api/brands/${b.id}`, { is_active: !b.is_active }));
  const remove = (b) => {
    if (!confirm(`ลบยี่ห้อ "${b.name}" ?\n\nคำขอ Visit เก่าที่เลือกยี่ห้อนี้ไว้จะยังแสดงชื่อเดิมตามปกติ`)) return;
    run(() => api.del(`/api/brands/${b.id}`), 'ลบยี่ห้อแล้ว');
  };
  const move = (b, dir) => {
    const idx = brands.findIndex(x => x.id === b.id);
    const other = brands[idx + dir];
    if (!other) return;
    run(async () => {
      await api.put(`/api/brands/${b.id}`, { sort_order: other.sort_order });
      await api.put(`/api/brands/${other.id}`, { sort_order: b.sort_order });
    });
  };

  return (
    <Layout title="Brand Master">
      <PageHero icon="tag" tone="orange" title="Brand Master" desc="จัดการรายการยี่ห้อที่ให้เลือกในฟอร์ม Visit" />
      <div className="card" style={{ maxWidth: 720 }}>
        <div className="card-head">
          <h3>Brand Master <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>· ยี่ห้อที่ให้เลือกในหัวข้อ Current Products / Brands</span></h3>
        </div>
        <div className="card-body">
          <form onSubmit={add} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="เพิ่มยี่ห้อใหม่ เช่น Fuji Electric" maxLength={60}
              style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9, font: 'inherit' }} />
            <button className="btn btn-primary" disabled={busy || !newName.trim()}>+ เพิ่ม</button>
          </form>
          {brands.length === 0 ? <div className="empty">ยังไม่มียี่ห้อ</div> : (
            <div style={{ display: 'grid', gap: 6 }}>
              {brands.map((b, i) => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 10, opacity: b.is_active ? 1 : .55 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <button type="button" className="btn btn-outline btn-sm" style={{ padding: '0 6px', lineHeight: 1.1 }} disabled={busy || i === 0} onClick={() => move(b, -1)} aria-label="เลื่อนขึ้น">▲</button>
                    <button type="button" className="btn btn-outline btn-sm" style={{ padding: '0 6px', lineHeight: 1.1, marginTop: 2 }} disabled={busy || i === brands.length - 1} onClick={() => move(b, 1)} aria-label="เลื่อนลง">▼</button>
                  </div>
                  {editing && editing.id === b.id ? (
                    <>
                      <input type="text" value={editing.name} autoFocus maxLength={60} onChange={e => setEditing({ ...editing, name: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEditing(null); }}
                        style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit' }} />
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={rename}>บันทึก</button>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>ยกเลิก</button>
                    </>
                  ) : (
                    <>
                      <b style={{ flex: 1 }}>{b.name}{!b.is_active && <span className="muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>(ปิดใช้งาน)</span>}</b>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditing({ id: b.id, name: b.name })}>แก้ชื่อ</button>
                      <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => toggle(b)}>{b.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
                      <button className="btn btn-outline btn-sm" style={{ color: 'var(--red-600)' }} disabled={busy} onClick={() => remove(b)}>ลบ</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>ยี่ห้อที่ "ปิดใช้งาน" จะไม่แสดงในฟอร์มใหม่ แต่คำขอเก่ายังเห็นชื่อเดิม</p>
        </div>
      </div>
    </Layout>
  );
}
