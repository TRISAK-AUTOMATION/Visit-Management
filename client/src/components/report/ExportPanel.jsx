// client/src/components/report/ExportPanel.jsx - ปุ่ม + แผงเลือกเงื่อนไขการส่งออก (Excel / PDF)
// ใช้ชุดตัวกรองเดียวกับตาราง (query) แล้วให้ Backend กรอง+ตรวจสิทธิ์+สร้างไฟล์เอง (ไม่กรองใน Browser)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import RIcon from './ReportIcons';
import ExportPreview from './ExportPreview';
import useReportOptions from './useReportOptions';
import { useToast } from '../../lib/ToastContext';

const storeKey = (type) => `trisak_rx_export_${type}`;
function loadPref(type) {
  try { return JSON.parse(sessionStorage.getItem(storeKey(type)) || 'null') || {}; } catch (e) { return {}; }
}
function savePref(type, v) {
  try { sessionStorage.setItem(storeKey(type), JSON.stringify(v)); } catch (e) { /* ไม่เป็นไร */ }
}

function fileNameFrom(res, fallback) {
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename="?([^";]+)"?/i.exec(cd);
  return m ? m[1] : fallback;
}

export default function ExportPanel({ type, query, sort, appliedUserId, align = 'right' }) {
  const toast = useToast();
  const { opts } = useReportOptions();
  const [open, setOpen] = useState(false);
  const pref = useMemo(() => loadPref(type), [type]);
  const [scope, setScope] = useState(pref.scope || 'filtered');
  const [format, setFormat] = useState(pref.format || 'xlsx');
  const [cols, setCols] = useState(null); // null = ยังไม่โหลดตัวเลือก
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false); // false | 'download' | 'preview'
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState(null); // { blob, name, format } ไฟล์ที่กำลังดูตัวอย่าง
  const wrapRef = useRef(null);
  const previewRef = useRef(null);

  const def = opts && opts.columns ? opts.columns[type] : null;
  const canAll = !!(opts && opts.can_view_all);
  const isSummary = type === 'summary';

  useEffect(() => {
    if (def && cols === null) {
      const saved = Array.isArray(pref.cols) ? pref.cols.filter(k => def.list.some(c => c.key === k)) : null;
      setCols(saved && saved.length ? saved : def.defaults);
    }
  }, [def, cols, pref]);

  // ถ้าผู้ใช้เลือกพนักงานในตัวกรองไว้แล้ว ใช้เป็นค่าเริ่มต้นของ Individual Report
  useEffect(() => { if (open && appliedUserId && !userId) setUserId(String(appliedUserId)); }, [open, appliedUserId, userId]);

  useEffect(() => {
    if (!open) return undefined;
    // หน้าต่างตัวอย่างอยู่นอกแผง (portal ไปที่ body) — คลิกในนั้นไม่ปิดแผง, Esc ปิดตัวอย่างก่อน
    const inPreview = (t) => !!(previewRef.current && previewRef.current.parentNode && previewRef.current.parentNode.contains(t));
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target) && !inPreview(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key !== 'Escape') return; if (previewRef.current) setPreview(null); else setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // พนักงานทั่วไปส่งออกได้เฉพาะของตัวเอง -> ไม่มีตัวเลือกรายบุคคล
  useEffect(() => { if (opts && !opts.can_view_all && scope === 'individual') setScope('filtered'); }, [opts, scope]);

  const allKeys = def ? def.list.map(c => c.key) : [];
  const labelOf = (k) => { const c = def && def.list.find(x => x.key === k); return c ? c.label : k; };
  // cols = คอลัมน์ที่เลือก "ตามลำดับที่จะออกในไฟล์" (Backend เรียงคอลัมน์ตามลำดับที่ส่งไป)
  // ติ๊กเพิ่ม = ต่อท้าย, เอาออก = ลบออกจากลำดับ
  const toggle = (k) => setCols(c => (c.includes(k) ? c.filter(x => x !== k) : [...c, k]));
  const selectAll = () => setCols(c => [...(c || []), ...allKeys.filter(k => !(c || []).includes(k))]); // คงลำดับที่จัดไว้ แล้วต่อท้ายที่ยังไม่ได้เลือก
  const resetOrder = () => setCols(c => allKeys.filter(k => c.includes(k)));
  const moveCol = (from, to) => setCols(c => {
    if (to < 0 || to >= c.length || from === to) return c;
    const next = [...c];
    const [k] = next.splice(from, 1);
    next.splice(to, 0, k);
    return next;
  });
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const isDefaultOrder = !!cols && cols.join(',') === allKeys.filter(k => cols.includes(k)).join(',');

  // สร้างไฟล์จาก Backend ตามเงื่อนไขที่เลือก -> { blob, name, format } หรือ null (แสดง error แล้ว)
  // ใช้ร่วมกันทั้ง "ดูตัวอย่าง" และ "ดาวน์โหลด" — ตัวอย่างจึงเป็นไฟล์เดียวกับที่ได้จริง
  const buildFile = async (mode) => {
    setErr('');
    if (!cols || !cols.length) { setErr('No columns selected. กรุณาเลือกคอลัมน์อย่างน้อย 1 รายการ'); return null; }
    if (scope === 'individual' && !userId) { setErr('Please select an employee. กรุณาเลือกพนักงาน'); return null; }
    const qs = new URLSearchParams(scope === 'full' ? '' : query);
    qs.set('format', format); qs.set('scope', scope); qs.set('columns', cols.join(','));
    if (scope === 'individual') qs.set('user_id', userId);
    if (sort && sort.key && scope === 'filtered') { qs.set('sort', sort.key); qs.set('dir', sort.dir); }
    savePref(type, { scope, format, cols });
    setBusy(mode); setDone(false);
    try {
      const res = await fetch(`/api/report/export/${type}?${qs.toString()}`, { credentials: 'same-origin' });
      if (!res.ok) {
        let msg = 'Export failed. ไม่สามารถสร้างไฟล์ได้';
        try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) { /* ไม่มี body */ }
        if (res.status === 403) msg = 'You do not have permission to access this report. ' + msg;
        setErr(msg); toast(msg, 'error');
        return null;
      }
      return { blob: await res.blob(), name: fileNameFrom(res, `report.${format}`), format };
    } catch (e) {
      setErr('Export failed. เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่'); toast('Export failed', 'error');
      return null;
    } finally { setBusy(false); }
  };

  const saveFile = (file) => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setDone(true);
    toast('Export completed successfully · ส่งออกรายงานสำเร็จ', 'success');
    setTimeout(() => setDone(false), 2200);
  };

  const doExport = async () => { const f = await buildFile('download'); if (f) saveFile(f); };
  const doPreview = async () => { const f = await buildFile('preview'); if (f) setPreview(f); };

  const individualAllowed = canAll && !isSummary;

  return (
    <div className="rx-export" ref={wrapRef}>
      <button type="button" className={`rx-export-btn ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog">
        <RIcon name="download" size={17} /> <span>Export Report</span> <RIcon name="chevronDown" size={15} className="rx-export-caret" />
      </button>

      {open && (
        <div className={`rx-export-panel ${align}`} role="dialog" aria-label="Export Report">
          <div className="rx-export-head">
            <h4>Export Report</h4>
            <button type="button" className="rx-x" onClick={() => setOpen(false)} aria-label="ปิด"><RIcon name="x" size={18} /></button>
          </div>

          <div className="rx-export-sec">
            <div className="rx-export-lab">เลือกประเภทการส่งออก</div>
            <label className="rx-radio"><input type="radio" name="rx-scope" checked={scope === 'filtered'} onChange={() => setScope('filtered')} /><span>ข้อมูลตามตัวกรองปัจจุบัน</span></label>
            {individualAllowed && (
              <>
                <label className="rx-radio"><input type="radio" name="rx-scope" checked={scope === 'individual'} onChange={() => setScope('individual')} /><span>รายบุคคล</span></label>
                {scope === 'individual' && (
                  <select className="rx-select rx-indent" value={userId} onChange={e => setUserId(e.target.value)} aria-label="เลือกพนักงาน">
                    <option value="">เลือกพนักงาน</option>
                    {opts.employees.map(e => <option key={e.id} value={e.id}>{e.full_name}{e.department ? ` (${e.department})` : ''}</option>)}
                  </select>
                )}
              </>
            )}
            <label className="rx-radio"><input type="radio" name="rx-scope" checked={scope === 'full'} onChange={() => setScope('full')} /><span>{canAll ? 'ทั้งหมด (ทุกคน)' : 'ข้อมูลของฉันทั้งหมด'}</span></label>
            {scope === 'full' && <p className="rx-hint">ไม่ใช้ตัวกรองใดๆ ส่งออกทุกช่วงเวลาภายในสิทธิ์ของคุณ</p>}
            {scope === 'individual' && <p className="rx-hint">ใช้ช่วงวันที่ตามตัวกรองปัจจุบัน เฉพาะพนักงานที่เลือก</p>}
          </div>

          <div className="rx-export-sec">
            <div className="rx-export-lab">รูปแบบไฟล์</div>
            <div className="rx-format">
              <label className={`rx-fmt ${format === 'xlsx' ? 'on' : ''}`}><input type="radio" name="rx-fmt" checked={format === 'xlsx'} onChange={() => setFormat('xlsx')} /><RIcon name="sheet" size={20} className="xl" /> Excel (.xlsx)</label>
              <label className={`rx-fmt ${format === 'pdf' ? 'on' : ''}`}><input type="radio" name="rx-fmt" checked={format === 'pdf'} onChange={() => setFormat('pdf')} /><RIcon name="pdf" size={20} className="pd" /> PDF (.pdf)</label>
            </div>
          </div>

          <div className="rx-export-sec">
            <div className="rx-export-lab rx-lab-row">
              <span>เลือกคอลัมน์ <em>({cols ? cols.length : 0}/{allKeys.length})</em></span>
              <span className="rx-mini-links">
                <button type="button" onClick={selectAll}>Select All</button>
                <button type="button" onClick={() => setCols([])}>Clear</button>
              </span>
            </div>
            <div className="rx-cols">
              {def ? def.list.map(c => (
                <label key={c.key} className="rx-check"><input type="checkbox" checked={!!cols && cols.includes(c.key)} onChange={() => toggle(c.key)} /><span>{c.label}</span></label>
              )) : <div className="rx-skel" style={{ height: 70 }} />}
            </div>
          </div>

          {cols && cols.length > 1 && (
            <div className="rx-export-sec">
              <div className="rx-export-lab rx-lab-row">
                <span>ลำดับคอลัมน์ในไฟล์</span>
                {!isDefaultOrder && <span className="rx-mini-links"><button type="button" onClick={resetOrder}>คืนค่าเริ่มต้น</button></span>}
              </div>
              <p className="rx-hint" style={{ margin: '0 0 8px' }}>ลาก หรือกดลูกศรเพื่อย้าย — ลำดับ 1 อยู่ซ้ายสุดในไฟล์</p>
              <ol className="rx-order" aria-label="ลำดับคอลัมน์ในไฟล์">
                {cols.map((k, i) => (
                  <li key={k}
                    className={`${dragFrom === i ? 'dragging' : ''} ${dragOver === i && dragFrom !== null && dragFrom !== i ? (dragFrom < i ? 'over-below' : 'over-above') : ''}`}
                    draggable
                    onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', k); } catch (err) { /* IE */ } }}
                    onDragOver={(e) => { e.preventDefault(); if (dragOver !== i) setDragOver(i); }}
                    onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) moveCol(dragFrom, i); setDragFrom(null); setDragOver(null); }}
                    onDragEnd={() => { setDragFrom(null); setDragOver(null); }}>
                    <span className="rx-grip" aria-hidden="true">⋮⋮</span>
                    <span className="rx-ord-n">{i + 1}</span>
                    <span className="rx-ord-label">{labelOf(k)}</span>
                    <button type="button" className="rx-ord-btn" onClick={() => moveCol(i, i - 1)} disabled={i === 0} aria-label={`ย้าย ${labelOf(k)} ขึ้น`} title="ย้ายขึ้น (ไปทางซ้ายในไฟล์)"><RIcon name="arrowUp" size={14} /></button>
                    <button type="button" className="rx-ord-btn" onClick={() => moveCol(i, i + 1)} disabled={i === cols.length - 1} aria-label={`ย้าย ${labelOf(k)} ลง`} title="ย้ายลง (ไปทางขวาในไฟล์)"><RIcon name="arrowDown" size={14} /></button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {err && <div className="rx-err" role="alert">{err}</div>}

          <div className="rx-go-row">
            <button type="button" className="rx-preview-btn" onClick={doPreview} disabled={!!busy || !def}>
              {busy === 'preview' ? <><span className="rx-spin dark" /> กำลังเตรียม...</> : <><RIcon name="eye" size={18} /> ดูตัวอย่าง</>}
            </button>
            <button type="button" className={`rx-go ${busy === 'download' ? 'busy' : ''} ${done ? 'done' : ''}`} onClick={doExport} disabled={!!busy || !def}>
              {busy === 'download' ? <><span className="rx-spin" /> กำลังสร้างไฟล์...</> : done
                ? <><RIcon name="check" size={18} className="rx-check-anim" /> ดาวน์โหลดแล้ว</>
                : <><RIcon name="download" size={18} /> ดาวน์โหลดรายงาน</>}
            </button>
          </div>
        </div>
      )}

      {preview && (
        <ExportPreview file={preview} boxRef={previewRef} onClose={() => setPreview(null)}
          onDownload={() => { saveFile(preview); setPreview(null); }} />
      )}
    </div>
  );
}
