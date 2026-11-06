// client/src/pages/AdminPageContent.jsx - Admin CMS: แก้ชื่อหน้า / เมนู / หัวข้อและหัวข้อย่อยของฟอร์ม Visit (ไม่ต้องแก้ Source Code)
import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import PageHero from '../components/PageHero';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { usePageContent } from '../lib/PageContentContext';
import { PAGE_TITLES, MENUS, FORM_ROWS } from '../lib/contentCatalog';

const TABS = [
  { id: 'pages', label: 'ชื่อหน้า', rows: PAGE_TITLES },
  { id: 'menus', label: 'เมนูด้านซ้าย', rows: MENUS },
  { id: 'form', label: 'หัวข้อฟอร์ม Visit', rows: FORM_ROWS }
];
const enc = (k) => encodeURIComponent(k);

export default function AdminPageContent() {
  const toast = useToast();
  const { pc, reload } = usePageContent();
  const [tab, setTab] = useState('pages');
  const [q, setQ] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { reload(); }, []); // eslint-disable-line

  const rows = useMemo(() => {
    const t = TABS.find(x => x.id === tab);
    const s = q.trim().toLowerCase();
    return t.rows.filter(r => !s || `${r.label} ${r.def || ''} ${r.hint || ''} ${r.sub || ''} ${pc(r.key, '')}`.toLowerCase().includes(s));
  }, [tab, q, pc]);

  const save = async (key, v) => {
    setBusy(true);
    try { await api.put(`/api/page-content/${enc(key)}`, { value: v }); toast('บันทึกสำเร็จ', 'success'); setEditingKey(null); await reload(); }
    catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };
  const reset = async (key) => {
    setBusy(true);
    try { await api.del(`/api/page-content/${enc(key)}`); toast('คืนค่าเริ่มต้นแล้ว', 'success'); await reload(); }
    catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };

  let lastGroup = null;
  return (
    <Layout title="จัดการหน้า/หัวข้อของระบบ">
      <PageHero icon="file" tone="slate" title="จัดการหน้า/หัวข้อ"
        desc='แก้ชื่อหน้า ชื่อเมนู และหัวข้อของฟอร์ม Visit ได้จากตรงนี้ มีผลทันทีที่บันทึก — กด "คืนค่าเดิม" เพื่อกลับเป็นชื่อมาตรฐาน (ส่วน "ตัวเลือก" ในแต่ละหัวข้อแก้ได้ที่ Form Builder)' />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {TABS.map(t => <button key={t.id} type="button" className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setTab(t.id); setEditingKey(null); }}>{t.label}</button>)}
        <input type="search" placeholder="ค้นหา..." value={q} onChange={(e) => setQ(e.target.value)} style={{ marginLeft: 'auto', padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 9, minWidth: 200 }} />
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead><tr><th>รายการ</th><th>ค่าเริ่มต้น</th><th>ข้อความที่แสดงตอนนี้</th><th style={{ width: 200 }}></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 20 }}>ไม่พบรายการ</td></tr>}
            {rows.map(r => {
              const cur = pc(r.key, undefined);
              const changed = cur !== undefined;
              const head = r.sub || r.group;
              const showHead = head !== lastGroup; lastGroup = head;
              return (
                <React.Fragment key={r.key}>
                  {showHead && <tr><td colSpan={4} style={{ background: '#f3f6fd', fontWeight: 700, fontSize: 12, color: '#1c3a8c' }}>{r.group}{r.sub ? ` › ${r.sub}` : ''}</td></tr>}
                  <tr>
                    <td>{r.label}{r.hint && <div className="muted" style={{ fontSize: 11 }}>{r.hint}</div>}</td>
                    <td className="muted">{r.toggle ? 'แสดง' : r.def}</td>
                    <td>
                      {editingKey === r.key
                        ? <input autoFocus value={value} maxLength={200} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(r.key, value); if (e.key === 'Escape') setEditingKey(null); }} style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8 }} />
                        : r.toggle ? (cur === '1' ? <b style={{ color: '#c0281f' }}>ซ่อนอยู่</b> : 'แสดง') : <b>{changed ? cur : r.def}</b>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {r.toggle ? (
                        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => (cur === '1' ? reset(r.key) : save(r.key, '1'))}>{cur === '1' ? 'แสดงกลับ' : 'ซ่อน'}</button>
                      ) : editingKey === r.key ? (
                        <>
                          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => save(r.key, value)}>บันทึก</button>{' '}
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingKey(null)}>ยกเลิก</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setEditingKey(r.key); setValue(changed ? cur : r.def); }}>แก้ไข</button>
                          {changed && <>{' '}<button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => reset(r.key)}>คืนค่าเดิม</button></>}
                        </>
                      )}
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div></div>
    </Layout>
  );
}
