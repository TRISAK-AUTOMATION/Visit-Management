// client/src/components/report/ExportPreview.jsx - หน้าต่างดูตัวอย่างไฟล์ส่งออก "ก่อนดาวน์โหลด"
// แสดงจากไฟล์จริงที่ Backend สร้าง (ไฟล์เดียวกับที่จะดาวน์โหลด) จึงเห็นหน้าตาตรงกับไฟล์ 100%
//   PDF  -> แสดงด้วยตัวเปิด PDF ของเบราว์เซอร์ (iframe)
//   Excel -> อ่านไฟล์ด้วย SheetJS แล้วแสดงเป็นตาราง แยกแท็บตามชีต
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx'; // อยู่ใน bundle หลักอยู่แล้ว (หน้า Customers ใช้นำเข้าไฟล์)
import RIcon from './ReportIcons';

const MAX_ROWS = 300; // ตัวอย่าง Excel แสดงไม่เกินนี้ต่อชีต (ไฟล์จริงมีครบทุกแถว)

export default function ExportPreview({ file, onClose, onDownload, boxRef }) {
  const { blob, name, format } = file;
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const [sheets, setSheets] = useState(null); // [{ name, rows: [[...]], total }]
  const [active, setActive] = useState(0);
  const [err, setErr] = useState('');
  const closeRef = useRef(null);

  useEffect(() => { if (closeRef.current) closeRef.current.focus(); }, []);

  useEffect(() => {
    if (format !== 'xlsx') return undefined;
    let alive = true;
    (async () => {
      try {
        const wb =XLSX.read(await blob.arrayBuffer(), { type: 'array', cellDates: true });
        const list = wb.SheetNames.map((n) => {
          // raw:false = ใช้ข้อความตามรูปแบบที่ตั้งในไฟล์ (วันที่/ตัวเลข) ให้ใกล้เคียงกับที่เห็นใน Excel
          const all = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, dateNF: 'dd/mm/yyyy', blankrows: true, defval: '' });
          return { name: n, rows: all.slice(0, MAX_ROWS + 1), total: Math.max(0, all.length - 1) };
        });
        if (alive) setSheets(list);
      } catch (e) {
        if (alive) setErr('อ่านไฟล์ Excel เพื่อแสดงตัวอย่างไม่ได้ แต่ยังดาวน์โหลดไฟล์ได้ตามปกติ');
      }
    })();
    return () => { alive = false; };
  }, [blob, format]);

  const sheet = sheets && sheets[active];
  const width = sheet ? Math.max(1, ...sheet.rows.map((r) => r.length)) : 0;

  return createPortal(
    <div className="rx-modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rx-modal rx-preview" role="dialog" aria-modal="true" aria-label="ตัวอย่างไฟล์ส่งออก" ref={boxRef}>
        <div className="rx-modal-head">
          <RIcon name={format === 'pdf' ? 'pdf' : 'sheet'} size={22} />
          <div>
            <div className="rx-modal-kicker">ตัวอย่างก่อนดาวน์โหลด · {format === 'pdf' ? 'PDF' : 'Excel'}</div>
            <h3 title={name}>{name}</h3>
          </div>
          <button type="button" className="rx-x" onClick={onClose} aria-label="ปิดตัวอย่าง" ref={closeRef}><RIcon name="x" size={18} /></button>
        </div>

        <div className="rx-preview-body">
          {format === 'pdf' ? (
            <>
              <iframe className="rx-preview-pdf" src={url} title={`ตัวอย่าง ${name}`} />
              <p className="rx-preview-note">ถ้าตัวอย่างไม่แสดง (มือถือบางรุ่นไม่รองรับ) <a href={url} target="_blank" rel="noreferrer">เปิดในแท็บใหม่</a></p>
            </>
          ) : err ? (
            <div className="rx-err" role="alert">{err}</div>
          ) : !sheets ? (
            <div className="rx-preview-loading"><span className="rx-spin dark" /> กำลังเตรียมตัวอย่าง...</div>
          ) : (
            <>
              {sheets.length > 1 && (
                <div className="rx-preview-tabs" role="tablist">
                  {sheets.map((s, i) => (
                    <button key={s.name} type="button" role="tab" aria-selected={i === active} className={i === active ? 'on' : ''} onClick={() => setActive(i)}>{s.name}</button>
                  ))}
                </div>
              )}
              <div className="rx-preview-sheet">
                <table>
                  <thead><tr><th className="rx-rn" />{Array.from({ length: width }, (_, c) => <th key={c}>{colName(c)}</th>)}</tr></thead>
                  <tbody>
                    {sheet.rows.map((r, i) => (
                      <tr key={i} className={i === 0 ? 'rx-first' : ''}>
                        <td className="rx-rn">{i + 1}</td>
                        {Array.from({ length: width }, (_, c) => <td key={c}>{r[c] === undefined ? '' : String(r[c])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sheet.total > MAX_ROWS && <p className="rx-preview-note">แสดงตัวอย่าง {MAX_ROWS} แถวแรก จากทั้งหมด {sheet.total} แถว — ไฟล์ที่ดาวน์โหลดมีครบทุกแถว</p>}
            </>
          )}
        </div>

        <div className="rx-preview-foot">
          <button type="button" className="btn btn-outline" onClick={onClose}>ปิด</button>
          <button type="button" className="rx-go rx-go-inline" onClick={onDownload}><RIcon name="download" size={18} /> ดาวน์โหลดไฟล์นี้</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ชื่อคอลัมน์แบบ Excel: 0 -> A, 25 -> Z, 26 -> AA
function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
