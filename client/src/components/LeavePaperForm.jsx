// client/src/components/LeavePaperForm.jsx - แสดงคำขอลาเป็น "ใบลาแบบกระดาษ" หน้าตาเดียวกับ PDF (routes/leavePdf.js)
// ข้อความในช่อง ลา(วัน)/ลา(ชั่วโมง) และช่องลงนามมาจาก server (paper) ซึ่งใช้กติกาเดียวกับ PDF (utils/paperForms.js)
import React from 'react';
import { PaperFit, PaperSigners } from './PaperParts';

// ช่องติ๊กประเภทการลา (ชื่อบนใบตามแบบฟอร์มกระดาษ: ลาพักร้อน = "ลาหยุดประจำปี")
const TYPES = [['ลาป่วย', 'ลาป่วย'], ['ลากิจ', 'ลากิจ'], ['ลาพักร้อน', 'ลาหยุดประจำปี']];

function Field({ label, value, align = 'center', className = '' }) {
  return (
    <div className={`lvp-field ${className}`}>
      <span className="lvp-label">{label}</span>
      <span className={`lvp-val ${align === 'left' ? 'left' : ''}`}>{value || ' '}</span>
    </div>
  );
}

export default function LeavePaperForm({ r, paper }) {
  if (!paper) return null;
  return (
    <PaperFit label="แบบฟอร์มใบลา" deps={paper}>
      <div className="otp-company">{paper.company}</div>
      <div className="otp-title">{paper.title}</div>

      <div className="lvp-row lvp-right"><Field label="วันที่" value={paper.date} className="lvp-date" /></div>
      <div className="lvp-row"><Field label="ชื่อ-นามสกุล" value={r.requester_name} align="left" className="grow" /></div>

      <div className="lvp-types">
        {TYPES.map(([key, label]) => (
          <span key={key} className="lvp-check"><span className={`lvp-box ${r.leave_type === key ? 'on' : ''}`} aria-hidden="true" />{label}</span>
        ))}
      </div>

      <div className="lvp-row"><Field label="เหตุผลในการลา" value={r.reason} align="left" className="grow lvp-reason" /></div>

      <div className="lvp-row">
        <Field label="ลา(วัน)" value={paper.dayText} className="grow" />
        <Field label="รวม" value={paper.dayTotal} className="lvp-total" /><span className="lvp-unit">วัน</span>
      </div>
      <div className="lvp-row">
        <Field label="ลา(ชั่วโมง)" value={paper.hourText} className="grow" />
        <Field label="รวม" value={paper.hourTotal} className="lvp-total" /><span className="lvp-unit">ชั่วโมง</span>
      </div>

      <div className="lvp-gap" />
      <PaperSigners signers={paper.signers} />
      <div className="otp-code">เลขที่เอกสาร {r.code}</div>
    </PaperFit>
  );
}
