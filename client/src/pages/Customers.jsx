// client/src/pages/Customers.jsx
import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import Layout from '../components/Layout';
import PageHero from '../components/PageHero';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { useAuth } from '../lib/AuthContext';

const COMPANIES = ['TAC', 'FAC', 'HTC'];
// ระดับลูกค้า + สี (ตรงกับหัวข้อ Customer Level ในฟอร์ม Visit)
const LEVELS = [
  { value: 'L1 Strategic', color: '#2f5bff', tint: '#eef3ff' },
  { value: 'L2 Growth', color: '#1fae62', tint: '#e8f7ee' },
  { value: 'L3 Maintain', color: '#0ea5b7', tint: '#e5f8fa' },
  { value: 'L4 Develop', color: '#f5a524', tint: '#fff6e0' },
  { value: 'L5 Low Priority', color: '#8b93a7', tint: '#f1f3f7' }
];
const levelStyle = (v) => { const l = LEVELS.find(x => x.value === v); return l ? { color: l.color, background: l.tint, borderColor: l.color } : {}; };
function LevelPill({ value }) {
  if (!value) return <span className="muted">-</span>;
  return <span style={{ ...levelStyle(value), border: '1px solid', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{value}</span>;
}
const addrCell = { maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const emptyForm = { name: '', contact_person: '', phone: '', email: '', address: '', company: '', code: '' };

// แปลง header ของไฟล์ (Excel/CSV) ให้ยืดหยุ่น รองรับหลายชื่อคอลัมน์ที่พบได้บ่อยจากไฟล์ SAP
const HEADER_MAP = {
  code: ['code', 'รหัส', 'รหัสลูกค้า', 'customer code', 'customer_code'],
  name: ['name', 'ชื่อ', 'ชื่อลูกค้า', 'ชื่อบริษัท', 'customer name', 'customer_name'],
  contact_person: ['contact_person', 'ผู้ติดต่อ', 'contact', 'contact person'],
  phone: ['phone', 'เบอร์โทร', 'โทรศัพท์', 'tel'],
  email: ['email', 'อีเมล', 'e-mail'],
  address: ['address', 'ที่อยู่'],
  tax_id: ['tax_id', 'เลขผู้เสียภาษี', 'tax id', 'taxid']
};

function normalizeHeader(h) {
  return (h || '').toString().trim().toLowerCase();
}

function mapRow(headerIndex, row) {
  const get = (key) => {
    const idx = headerIndex[key];
    return idx === undefined ? '' : (row[idx] ?? '').toString().trim();
  };
  return {
    code: get('code'), name: get('name'), contact_person: get('contact_person'),
    phone: get('phone'), email: get('email'), address: get('address'), tax_id: get('tax_id')
  };
}

// อ่านไฟล์ .xlsx / .xls / .csv ในเบราว์เซอร์ แล้วคืนค่าเป็น array ของ record ที่ map คอลัมน์แล้ว
async function parseFileToRecords(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  if (!rows.length) return [];

  const headerRow = rows[0].map(normalizeHeader);
  const headerIndex = {};
  Object.entries(HEADER_MAP).forEach(([key, aliases]) => {
    const idx = headerRow.findIndex(h => aliases.includes(h));
    if (idx !== -1) headerIndex[key] = idx;
  });

  return rows.slice(1)
    .filter(r => r.some(cell => (cell ?? '').toString().trim() !== ''))
    .map(r => mapRow(headerIndex, r))
    .filter(r => r.code && r.name);
}

export default function Customers() {
  const toast = useToast();
  const { me } = useAuth();
  const isAdmin = me && me.role === 'Admin';
  const fileInputRef = useRef(null);

  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [editing, setEditing] = useState(undefined); // undefined = ปิด modal, null = เพิ่มใหม่, object = แก้ไข
  const [form, setForm] = useState(emptyForm);
  const [pendingCount, setPendingCount] = useState(0); // จำนวนลูกค้าใหม่ที่รอตรวจสอบ (แสดงบนแท็บ)

  // รวมลูกค้ารอตรวจสอบเข้ากับลูกค้าเดิม
  const [mergeSource, setMergeSource] = useState(null);
  const [mergeQuery, setMergeQuery] = useState('');
  const [mergeResults, setMergeResults] = useState([]);
  const [mergeTarget, setMergeTarget] = useState(null);
  const [merging, setMerging] = useState(false);

  // Import modal state
  const [importOpen, setImportOpen] = useState(false);
  const [importCompany, setImportCompany] = useState(COMPANIES[0]);
  const [importRecords, setImportRecords] = useState(null); // parsed records รอ confirm
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting] = useState(false);

  const load = async (query, comp) => {
    const params = new URLSearchParams();
    params.set('include_archived', '1');
    if (query) params.set('q', query);
    if (comp === 'pending') params.set('pending', '1');
    else if (comp && comp !== 'all') params.set('company', comp);
    const { customers } = await api.get(`/api/customers?${params.toString()}`);
    setCustomers(customers);
    if (isAdmin) {
      api.get('/api/customers?pending=1&include_archived=1').then(r => setPendingCount(r.customers.length)).catch(() => {});
    }
  };

  useEffect(() => { load(q, companyFilter).catch(err => toast(err.message, 'error')); }, [companyFilter]);
  useEffect(() => {
    const t = setTimeout(() => load(q, companyFilter).catch(err => toast(err.message, 'error')), 250);
    return () => clearTimeout(t);
  }, [q]);

  const openForm = (c) => {
    setEditing(c || null);
    setForm(c
      ? { code: '', name: c.name, contact_person: c.contact_person || '', phone: c.phone || '', email: c.email || '', address: c.address || '', company: c.company || '' }
      : { ...emptyForm, company: COMPANIES.includes(companyFilter) ? companyFilter : '' });
  };

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) await api.put(`/api/customers/${editing.id}`, form);
      else await api.post('/api/customers', form);
      toast('บันทึกสำเร็จ', 'success');
      setEditing(undefined);
      load(q, companyFilter);
    } catch (err) { toast(err.message, 'error'); }
  };

  // แก้ระดับลูกค้าได้ทันทีจากตาราง (Admin)
  const changeLevel = async (c, level) => {
    const prev = c.level;
    setCustomers(list => list.map(x => x.id === c.id ? { ...x, level: level || null } : x));
    try {
      await api.put(`/api/customers/${c.id}/level`, { level });
      toast(`อัปเดตระดับลูกค้า ${c.code} แล้ว`, 'success');
    } catch (err) {
      setCustomers(list => list.map(x => x.id === c.id ? { ...x, level: prev } : x));
      toast(err.message, 'error');
    }
  };

  const remove = async (id) => {
    if (!confirm('ยืนยันลบลูกค้ารายนี้หรือไม่?')) return;
    try {
      await api.del(`/api/customers/${id}`);
      toast('ลบสำเร็จ', 'success');
      load(q, companyFilter);
    } catch (err) { toast(err.message, 'error'); }
  };

  // ---------- Import ----------
  const openImport = () => {
    setImportCompany(COMPANIES.includes(companyFilter) ? companyFilter : COMPANIES[0]);
    setImportRecords(null);
    setImportFileName('');
    setImportOpen(true);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setImportFileName(file.name);
    try {
      const records = await parseFileToRecords(file);
      if (!records.length) {
        toast('อ่านไฟล์ไม่พบข้อมูล กรุณาตรวจสอบว่ามีคอลัมน์ code และ name', 'error');
        setImportRecords(null);
        return;
      }
      setImportRecords(records);
    } catch (err) {
      toast('ไม่สามารถอ่านไฟล์นี้ได้ กรุณาตรวจสอบรูปแบบไฟล์', 'error');
      setImportRecords(null);
    }
  };

  const confirmImport = async () => {
    if (!importRecords || !importRecords.length) return;
    const ok = confirm(
      `ยืนยันนำเข้าข้อมูล ${importRecords.length} รายการเข้าบริษัท ${importCompany}?\n\n` +
      `คำเตือน: ลูกค้าเดิมของบริษัท ${importCompany} ที่ "ไม่มี" อยู่ในไฟล์นี้จะถูกลบออกทั้งหมด ` +
      `(ยกเว้นรายที่มีคำขอ Visit เก่าผูกอยู่ จะถูกเก็บถาวรแทนการลบ)`
    );
    if (!ok) return;

    setImporting(true);
    try {
      const result = await api.post('/api/customers/import', { company: importCompany, records: importRecords });
      toast(
        `นำเข้าสำเร็จ: เพิ่มใหม่ ${result.inserted}, อัปเดต ${result.updated}, ลบ ${result.deleted}, เก็บถาวร ${result.archived}` +
        (result.skipped ? `, ข้าม ${result.skipped} แถว (ข้อมูลไม่ครบ)` : ''),
        'success'
      );
      setImportOpen(false);
      setImportRecords(null);
      load(q, companyFilter);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  // ---------- Delete all ----------
  const deleteAll = async () => {
    const scopeLabel = !COMPANIES.includes(companyFilter) ? 'ทุกบริษัท' : `บริษัท ${companyFilter}`;
    const ok = confirm(
      `ยืนยันลบข้อมูลลูกค้าทั้งหมดของ ${scopeLabel}?\n\n` +
      `คำเตือน: การกระทำนี้ไม่สามารถย้อนกลับได้ (รายที่มีคำขอ Visit เก่าผูกอยู่จะถูกเก็บถาวรแทนการลบจริง)`
    );
    if (!ok) return;
    try {
      const qs = COMPANIES.includes(companyFilter) ? `?company=${companyFilter}` : '';
      const result = await api.del(`/api/customers/bulk/all${qs}`);
      toast(`ลบสำเร็จ: ลบ ${result.deleted} รายการ, เก็บถาวร ${result.archived} รายการ`, 'success');
      load(q, companyFilter);
    } catch (err) { toast(err.message, 'error'); }
  };

  // ---------- รวมลูกค้ารอตรวจสอบเข้ากับลูกค้าเดิม ----------
  const openMerge = (c) => { setMergeSource(c); setMergeQuery(''); setMergeResults([]); setMergeTarget(null); };

  useEffect(() => {
    if (!mergeSource) return;
    const qq = mergeQuery.trim();
    if (!qq) { setMergeResults([]); return; }
    const t = setTimeout(() => {
      api.get(`/api/customers?q=${encodeURIComponent(qq)}`)
        .then(r => setMergeResults(r.customers.filter(x => !x.is_pending && x.id !== mergeSource.id).slice(0, 20)))
        .catch(() => setMergeResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [mergeQuery, mergeSource]);

  const confirmMerge = async () => {
    if (!mergeTarget) return;
    if (!confirm(`ยืนยันรวม "${mergeSource.name}" (${mergeSource.code}) เข้ากับ "${mergeTarget.name}" (${mergeTarget.code})?\n\nคำขอ Visit/OT ที่ผูกกับรายนี้จะถูกย้ายไปที่ลูกค้าปลายทาง และรายนี้จะถูกลบออก`)) return;
    setMerging(true);
    try {
      const r = await api.post(`/api/customers/${mergeSource.id}/merge`, { target_id: mergeTarget.id });
      toast(`รวมสำเร็จ: ย้าย Visit ${r.visits} รายการ, OT ${r.ots} รายการ`, 'success');
      setMergeSource(null);
      load(q, companyFilter);
    } catch (err) { toast(err.message, 'error'); }
    finally { setMerging(false); }
  };

  return (
    <Layout title="Customer">
      <PageHero icon="building" tone="blue" title="Customer" desc="รายชื่อลูกค้าและบริษัทในระบบ ค้นหา เพิ่ม และแก้ไขข้อมูลลูกค้า" />
      <div className="flex between mb-16" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="tabs">
          <div className={`tab ${companyFilter === 'all' ? 'active' : ''}`} onClick={() => setCompanyFilter('all')}>ทั้งหมด</div>
          {COMPANIES.map(c => (
            <div key={c} className={`tab ${companyFilter === c ? 'active' : ''}`} onClick={() => setCompanyFilter(c)}>{c}</div>
          ))}
          {isAdmin && (
            <div className={`tab ${companyFilter === 'pending' ? 'active' : ''}`} onClick={() => setCompanyFilter('pending')}>
              รอตรวจสอบ{pendingCount > 0 && <span className="badge pending" style={{ marginLeft: 6 }}>{pendingCount}</span>}
            </div>
          )}
        </div>
        <div className="flex cus-tools" style={{ gap: 10 }}>
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาลูกค้า / Sales..."
            style={{ width: 220, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9 }} />
          {isAdmin && <button className="btn btn-outline" onClick={openImport}>นำเข้าจากไฟล์</button>}
          {isAdmin && <button className="btn btn-danger" onClick={deleteAll}>ลบข้อมูลทั้งหมด</button>}
          {isAdmin && <button className="btn btn-primary" onClick={() => openForm(null)}>+ เพิ่มลูกค้า</button>}
        </div>
      </div>

      {isAdmin ? (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>รหัสลูกค้า</th><th>ชื่อบริษัท</th><th>Sales</th><th>SSO</th><th>ที่อยู่</th><th>Level</th><th>Company</th><th>เบอร์โทร</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
              <tbody>
                {customers.length ? customers.map(c => (
                  <tr key={c.id} style={c.is_archived ? { opacity: 0.55 } : undefined}>
                    <td>{c.code}</td>
                    <td>{c.name}</td>
                    <td>{c.contact_person || '-'}</td>
                    <td>{c.sso || '-'}</td>
                    <td style={addrCell} title={c.address || ''}>{c.address || '-'}</td>
                    <td>
                      <select value={c.level || ''} onChange={e => changeLevel(c, e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, ...(c.level ? levelStyle(c.level) : {}) }}>
                        <option value="">- ไม่ระบุ -</option>
                        {LEVELS.map(l => <option key={l.value} value={l.value}>{l.value}</option>)}
                      </select>
                    </td>
                    <td>{c.company || '-'}</td>
                    <td>{c.phone || '-'}</td>
                    <td>{c.is_archived ? <span className="badge cancelled">เก็บถาวร</span> : c.is_pending ? <span className="badge pending">รอตรวจสอบ</span> : <span className="badge approved">ใช้งานอยู่</span>}</td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={() => openForm(c)}>แก้ไข</button>{' '}
                      {c.is_pending ? <><button className="btn btn-outline btn-sm" onClick={() => openMerge(c)}>รวมกับลูกค้าเดิม</button>{' '}</> : null}
                      <button className="btn btn-danger btn-sm" onClick={() => remove(c.id)}>ลบ</button>
                    </td>
                  </tr>
                )) : <tr><td colSpan={10} className="empty">ไม่พบข้อมูลลูกค้า</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // พนักงาน/ผู้อนุมัติ: ดูได้อย่างเดียว โชว์แค่รายชื่อบริษัทเฉยๆ ไม่มีปุ่มแก้ไข/ลบ
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>รหัสลูกค้า</th><th>ชื่อบริษัท</th><th>Sales</th><th>SSO</th><th>ที่อยู่</th><th>Level</th></tr></thead>
              <tbody>
                {customers.length ? customers.filter(c => !c.is_archived).map(c => (
                  <tr key={c.id}>
                    <td>{c.code}</td><td>{c.name}</td><td>{c.contact_person || '-'}</td><td>{c.sso || '-'}</td>
                    <td style={addrCell} title={c.address || ''}>{c.address || '-'}</td>
                    <td><LevelPill value={c.level} /></td>
                  </tr>
                )) : <tr><td colSpan={6} className="empty">ไม่พบข้อมูลลูกค้า</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* เพิ่ม/แก้ไขลูกค้ารายเดียว */}
      {editing !== undefined && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setEditing(undefined); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>{editing ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าใหม่'}</h3>
              <button className="modal-close" onClick={() => setEditing(undefined)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSubmit}>
                {editing && editing.is_pending ? (
                  <div className="form-group">
                    <label>รหัสลูกค้าจริง</label>
                    <input value={form.code} onChange={set('code')} placeholder={`ปัจจุบันเป็นรหัสชั่วคราว ${editing.code}`} />
                    <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>ใส่รหัสจริงแล้วบันทึก = ยืนยันเป็นลูกค้าในระบบ (ออกจากสถานะรอตรวจสอบ) ถ้าซ้ำกับลูกค้าเดิมให้ใช้ปุ่ม "รวมกับลูกค้าเดิม" แทน</p>
                  </div>
                ) : null}
                <div className="form-group"><label>ชื่อบริษัท <span className="req">*</span></label><input value={form.name} onChange={set('name')} required /></div>
                <div className="form-group">
                  <label>บริษัท (Based on)</label>
                  <select value={form.company} onChange={set('company')}>
                    <option value="">- ไม่ระบุ -</option>
                    {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>ผู้ติดต่อ</label><input value={form.contact_person} onChange={set('contact_person')} /></div>
                <div className="form-group"><label>เบอร์โทร</label><input value={form.phone} onChange={set('phone')} /></div>
                <div className="form-group"><label>อีเมล</label><input value={form.email} onChange={set('email')} /></div>
                <div className="form-group"><label>ที่อยู่</label><textarea value={form.address} onChange={set('address')} /></div>
                <div className="form-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setEditing(undefined)}>ยกเลิก</button>
                  <button type="submit" className="btn btn-primary">บันทึก</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* รวมลูกค้ารอตรวจสอบเข้ากับลูกค้าเดิม */}
      {mergeSource && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setMergeSource(null); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>รวมกับลูกค้าเดิม</h3>
              <button className="modal-close" onClick={() => setMergeSource(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ marginTop: 0 }}>ลูกค้าใหม่: <b>{mergeSource.code} — {mergeSource.name}</b></p>
              <div className="form-group">
                <label>ค้นหาลูกค้าเดิมที่ต้องการรวมเข้าด้วย</label>
                <input value={mergeQuery} onChange={e => { setMergeQuery(e.target.value); setMergeTarget(null); }} placeholder="พิมพ์รหัสหรือชื่อบริษัท..." autoFocus />
              </div>
              {mergeResults.length > 0 && (
                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10 }}>
                  {mergeResults.map(r => (
                    <div key={r.id} onClick={() => setMergeTarget(r)}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f2f2f2', background: mergeTarget && mergeTarget.id === r.id ? '#e7edff' : '#fff' }}>
                      <b>{r.code}</b> — {r.name}{r.company ? <span className="muted"> ({r.company})</span> : null}
                    </div>
                  ))}
                </div>
              )}
              {mergeTarget && <p style={{ fontSize: 13 }}>รวมเข้ากับ: <b>{mergeTarget.code} — {mergeTarget.name}</b></p>}
              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => setMergeSource(null)}>ยกเลิก</button>
                <button type="button" className="btn btn-primary" disabled={!mergeTarget || merging} onClick={confirmMerge}>
                  {merging ? 'กำลังรวม...' : 'ยืนยันรวม'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* นำเข้าจากไฟล์ Excel/CSV */}
      {importOpen && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setImportOpen(false); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>นำเข้าฐานข้อมูลลูกค้าจากไฟล์</h3>
              <button className="modal-close" onClick={() => setImportOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>นำเข้าเป็นของบริษัท <span className="req">*</span></label>
                <select value={importCompany} onChange={e => setImportCompany(e.target.value)}>
                  {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>ไฟล์ (.xlsx, .xls, .csv)</label>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
                <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  คอลัมน์ที่ต้องมี: code, name (รองรับด้วย: contact_person, phone, email, address, tax_id — ชื่อคอลัมน์ภาษาไทยก็ได้เช่น รหัสลูกค้า, ชื่อลูกค้า)
                </p>
              </div>
              {importRecords && (
                <div style={{ margin: '10px 0' }}>
                  <p><strong>{importFileName}</strong> — อ่านพบ {importRecords.length} รายการที่ข้อมูลครบ</p>
                  <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <table>
                      <thead><tr><th>code</th><th>name</th><th>contact_person</th></tr></thead>
                      <tbody>
                        {importRecords.slice(0, 5).map((r, i) => (
                          <tr key={i}><td>{r.code}</td><td>{r.name}</td><td>{r.contact_person || '-'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importRecords.length > 5 && <p className="muted" style={{ fontSize: 13 }}>...และอีก {importRecords.length - 5} รายการ</p>}
                </div>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => setImportOpen(false)}>ยกเลิก</button>
                <button type="button" className="btn btn-primary" disabled={!importRecords || importing} onClick={confirmImport}>
                  {importing ? 'กำลังนำเข้า...' : 'ยืนยันนำเข้า (แทนที่ข้อมูลเดิม)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
