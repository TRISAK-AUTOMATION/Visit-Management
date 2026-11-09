// client/src/components/OtPaperForm.jsx - แสดงคำขอ OT เป็น "ใบ OT แบบกระดาษ" หน้าตาเดียวกับ PDF (routes/otPdf.js)
// ใช้ในหน้าต่างรายละเอียดคำขอ (ผู้อนุมัติ/ผู้ขอ) - เป็น HTML จึงดูได้ทุกเครื่องรวมมือถือ และแสดงได้ทุกสถานะ (PDF จริงออกได้เฉพาะใบที่อนุมัติแล้ว)
// ข้อมูลหัวเอกสาร/ช่องลงนามมาจาก server (paper) ซึ่งใช้กติกาเดียวกับ PDF (utils/paperForms.js)
import React from 'react';
import { fmtDate } from '../lib/api';
import { PaperFit, PaperSigners } from './PaperParts';

const clock = (t) => (t ? `${String(t).replace(':', '.')} น.` : '');
const EMPTY_ROWS = 4;

export default function OtPaperForm({ r, paper }) {
  if (!paper) return null;
  const holiday = r.day_type === 'holiday';
  const ref = [r.project_no, r.job_no].filter(Boolean).join(' / ');
  return (
    <PaperFit label="แบบฟอร์มคำขอทำงานล่วงเวลา" deps={paper}>
      <div className="otp-company">{paper.company}</div>
      <div className="otp-title">{paper.title}</div>

      <div className="otp-line">
        <span>Name :</span><span className="otp-fill otp-name">{r.requester_name}</span>
        <span className="otp-gap">Date</span><span className="otp-fill otp-date">{paper.date}</span>
      </div>

      <table className="otp-table">
        <colgroup><col style={{ width: '13%' }} /><col style={{ width: '26%' }} /><col /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: '7%' }} /></colgroup>
        <thead><tr><th>Date</th><th>Customer</th><th>Details</th><th>Start</th><th>Finish</th><th>Hr</th></tr></thead>
        <tbody>
          <tr>
            <td className="c">{fmtDate(r.ot_date)}<div className={holiday ? 'otp-red' : ''}>{holiday ? 'วันหยุด' : 'วันทำงาน'}</div></td>
            <td>{r.customer_name || r.location || ''}{ref && <div className="otp-red">{ref}</div>}</td>
            <td className="otp-detail">{r.work_detail}</td>
            <td className="c b">{clock(r.time_from)}</td>
            <td className="c b">{clock(r.time_to)}</td>
            <td className="c">{r.hours}</td>
          </tr>
          {Array.from({ length: EMPTY_ROWS }, (_, i) => <tr key={i} className="otp-empty"><td /><td /><td /><td /><td /><td /></tr>)}
        </tbody>
      </table>

      <PaperSigners signers={paper.signers} />
      <div className="otp-code">เลขที่เอกสาร {r.code}</div>
    </PaperFit>
  );
}
