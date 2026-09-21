// client/src/pages/Report.jsx - หน้าสรุปรายงาน 1 หน้า: กรองตามช่วงวันที่, สรุปแยกตามแผนก/พนักงาน,
// ตารางรายการทั้งหมด, ส่งออก Excel และเลือกพิมพ์เฉพาะส่วนที่ต้องการ (print เป็น PDF ผ่าน browser)
import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import Layout from '../components/Layout';
import { usePageContent } from '../lib/PageContentContext';
import { useAuth } from '../lib/AuthContext';
import { api, fmtDate, statusLabel } from '../lib/api';

function pct(v, total) { return total ? Math.round((v / total) * 100) : 0; }
function pad2(n) { return String(n).padStart(2, '0'); }
function isoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

// คำนวณช่วงวันที่ (from/to แบบ YYYY-MM-DD) จาก preset ที่เลือก ใช้เทียบกับ visit_date ตรงๆ ได้เลยเพราะเก็บเป็น ISO string อยู่แล้ว
function rangeFor(preset, customFrom, customTo) {
  const today = new Date();
  if (preset === 'this_month') {
    return [isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 0))];
  }
  if (preset === 'last_month') {
    return [isoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)), isoDate(new Date(today.getFullYear(), today.getMonth(), 0))];
  }
  if (preset === 'custom') return [customFrom || null, customTo || null];
  return [null, null]; // all
}

function DonutSVG({ data }) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  let cum = 0;
  const r = 60, cx = 80, cy = 80, sw = 22;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="flex gap-12" style={{ alignItems: 'center' }}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        {data.map(d => {
          const frac = d.value / total;
          const dash = frac * circumference;
          const el = (
            <circle key={d.label} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={sw}
              strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-cum * circumference}
              transform={`rotate(-90 ${cx} ${cy})`} />
          );
          cum += frac;
          return el;
        })}
        <circle cx={cx} cy={cy} r={r - sw / 2 - 2} fill="#fff" />
      </svg>
      <div>
        {data.map(d => (
          <div key={d.label} className="flex gap-8" style={{ marginBottom: 6, fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, display: 'inline-block' }} />
            {d.label} <b style={{ marginLeft: 'auto' }}>{d.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

// แถบสรุปแบบ bar list ใช้ซ้ำได้ทั้งแยกตามลูกค้า/แผนก/พนักงาน
function BreakdownBars({ entries, maxCount, emptyText }) {
  return entries.length ? entries.map(([name, count]) => (
    <div key={name} style={{ marginBottom: 10 }}>
      <div className="flex between" style={{ fontSize: 12.5, marginBottom: 4 }}><span>{name}</span><b>{count}</b></div>
      <div style={{ background: 'var(--bg)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
        <div style={{ width: `${(count / maxCount) * 100}%`, background: 'var(--blue-600)', height: '100%', borderRadius: 6 }} />
      </div>
    </div>
  )) : <div className="empty">{emptyText}</div>;
}

const PRESETS = [
  { key: 'this_month', label: 'เดือนนี้' },
  { key: 'last_month', label: 'เดือนก่อน' },
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'custom', label: 'กำหนดเอง' }
];

const SECTION_DEFS = [
  { key: 'summary', label: 'สรุปตัวเลขรวม' },
  { key: 'statusChart', label: 'สัดส่วนสถานะ' },
  { key: 'byCustomer', label: 'แยกตามลูกค้า' },
  { key: 'byDept', label: 'แยกตามแผนก' },
  { key: 'byEmployee', label: 'แยกตามพนักงาน/ผู้ขอ' },
  { key: 'table', label: 'ตารางรายการทั้งหมด' }
];

export default function Report() {
  const { pc } = usePageContent();
  const { me } = useAuth();
  const [requests, setRequests] = useState(null);
  const [preset, setPreset] = useState('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [printSel, setPrintSel] = useState(() => {
    const o = {}; SECTION_DEFS.forEach(s => { o[s.key] = true; }); return o;
  });

  useEffect(() => {
    const scope = me.role === 'Employee' ? 'mine' : 'pending';
    api.get(`/api/visit-requests?scope=${scope}`).then(r => setRequests(r.requests));
  }, [me.role]);

  const [from, to] = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const filtered = useMemo(() => {
    if (!requests) return [];
    if (!from && !to) return requests;
    return requests.filter(r => {
      const d = r.visit_date;
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [requests, from, to]);

  if (!requests) return <Layout title={pc('report.title', 'Report')}><p className="muted">กำลังโหลดข้อมูล...</p></Layout>;

  const total = filtered.length;
  const approved = filtered.filter(r => r.status === 'approved').length;
  const pending = filtered.filter(r => r.status === 'pending').length;
  const rejected = filtered.filter(r => r.status === 'rejected').length;
  const cancelled = filtered.filter(r => r.status === 'cancelled').length;

  const countBy = (getKey) => {
    const map = {};
    filtered.forEach(r => { const k = getKey(r) || 'ไม่ระบุ'; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  };
  const custEntries = countBy(r => r.customer_name).slice(0, 6);
  const deptEntries = countBy(r => r.requester_department).slice(0, 8);
  const empEntries = countBy(r => r.requester_name).slice(0, 8);
  const maxCust = Math.max(1, ...custEntries.map(e => e[1]));
  const maxDept = Math.max(1, ...deptEntries.map(e => e[1]));
  const maxEmp = Math.max(1, ...empEntries.map(e => e[1]));

  const tableRows = [...filtered].sort((a, b) => (b.visit_date || '').localeCompare(a.visit_date || ''));

  const togglePrint = (key) => (e) => setPrintSel(s => ({ ...s, [key]: e.target.checked }));
  const cls = (key) => printSel[key] ? 'report-section' : 'report-section no-print';

  const exportExcel = () => {
    const rows = tableRows.map(r => ({
      'วันที่': fmtDate(r.visit_date),
      'ลูกค้า': r.customer_name || '',
      'ผู้ขอ': r.requester_name || '',
      'แผนก': r.requester_department || '',
      'เวลาเริ่ม': r.time_from || '',
      'เวลาสิ้นสุด': r.time_to || '',
      'สถานะ': statusLabel(r.status),
      'วัตถุประสงค์': r.purpose || ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    const rangeLabel = preset === 'all' ? 'ทั้งหมด' : `${from || ''}_${to || ''}`;
    XLSX.writeFile(wb, `trisak-visit-report-${rangeLabel}.xlsx`);
  };

  return (
    <Layout title={pc('report.title', 'Report')}>
      <div className="card no-print" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>ช่วงวันที่ (ตามวันที่ Visit)</div>
            <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
              {PRESETS.map(p => (
                <button key={p.key} type="button"
                  className={`btn btn-sm ${preset === p.key ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setPreset(p.key)}>{p.label}</button>
              ))}
            </div>
          </div>
          {preset === 'custom' && (
            <div className="flex gap-8" style={{ alignItems: 'center' }}>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ width: 150 }} />
              <span className="muted">ถึง</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ width: 150 }} />
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={exportExcel}>⬇ ส่งออก Excel</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>🖨 พิมพ์รายงาน</button>
          </div>
        </div>
        <div className="card-body" style={{ paddingTop: 0 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>เลือกส่วนที่จะพิมพ์ (ไม่มีผลกับหน้าจอ มีผลตอนกดพิมพ์เท่านั้น)</div>
          <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
            {SECTION_DEFS.map(s => (
              <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 400 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={printSel[s.key]} onChange={togglePrint(s.key)} /> {s.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="print-only" style={{ display: 'none', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>รายงานสรุปคำขอ Visit</h2>
        <div className="muted" style={{ fontSize: 12.5 }}>
          ช่วงข้อมูล: {preset === 'all' ? 'ทั้งหมด' : `${from ? fmtDate(from) : '-'} ถึง ${to ? fmtDate(to) : '-'}`}
          &nbsp;·&nbsp; พิมพ์เมื่อ {fmtDate(isoDate(new Date()))}
        </div>
      </div>

      <div className={cls('summary')}>
        <div className="stat-grid">
          <div className="stat-card blue"><div className="label">คำขอทั้งหมด</div><div className="value">{total}<span className="unit">คำขอ</span></div></div>
          <div className="stat-card green"><div className="label">อนุมัติแล้ว</div><div className="value">{approved}<span className="unit">{pct(approved, total)}%</span></div></div>
          <div className="stat-card orange"><div className="label">รออนุมัติ</div><div className="value">{pending}<span className="unit">{pct(pending, total)}%</span></div></div>
          <div className="stat-card red"><div className="label">ไม่อนุมัติ</div><div className="value">{rejected}<span className="unit">{pct(rejected, total)}%</span></div></div>
        </div>
      </div>

      <div className="grid-2">
        <div className={cls('byCustomer')}>
          <div className="card">
            <div className="card-head"><h3>จำนวนคำขอแยกตามลูกค้า</h3></div>
            <div className="card-body"><BreakdownBars entries={custEntries} maxCount={maxCust} emptyText="ไม่มีข้อมูล" /></div>
          </div>
        </div>
        <div className={cls('statusChart')}>
          <div className="card">
            <div className="card-head"><h3>สัดส่วนสถานะ</h3></div>
            <div className="card-body">
              <DonutSVG data={[
                { label: 'อนุมัติแล้ว', value: approved, color: '#1fae62' },
                { label: 'รออนุมัติ', value: pending, color: '#f5a524' },
                { label: 'ไม่อนุมัติ', value: rejected, color: '#f0483e' },
                { label: 'ยกเลิก', value: cancelled, color: '#9aa2b4' },
              ]} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 20 }}>
        <div className={cls('byDept')}>
          <div className="card">
            <div className="card-head"><h3>จำนวนคำขอแยกตามแผนก</h3></div>
            <div className="card-body"><BreakdownBars entries={deptEntries} maxCount={maxDept} emptyText="ไม่มีข้อมูล" /></div>
          </div>
        </div>
        <div className={cls('byEmployee')}>
          <div className="card">
            <div className="card-head"><h3>จำนวนคำขอแยกตามพนักงาน/ผู้ขอ</h3></div>
            <div className="card-body"><BreakdownBars entries={empEntries} maxCount={maxEmp} emptyText="ไม่มีข้อมูล" /></div>
          </div>
        </div>
      </div>

      <div className={cls('table')} style={{ marginTop: 20 }}>
        <div className="card">
          <div className="card-head"><h3>รายการคำขอทั้งหมด ({tableRows.length} รายการ)</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr><th>วันที่</th><th>ลูกค้า</th><th>ผู้ขอ</th><th>แผนก</th><th>เวลา</th><th>สถานะ</th></tr>
                </thead>
                <tbody>
                  {tableRows.length ? tableRows.map(r => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.visit_date)}</td>
                      <td>{r.customer_name || '-'}</td>
                      <td>{r.requester_name || '-'}</td>
                      <td>{r.requester_department || '-'}</td>
                      <td>{r.time_from} - {r.time_to}</td>
                      <td><span className={`badge ${r.status}`}>{statusLabel(r.status)}</span></td>
                    </tr>
                  )) : <tr><td colSpan={6} className="empty">ไม่มีข้อมูลในช่วงที่เลือก</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
