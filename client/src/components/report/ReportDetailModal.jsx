// client/src/components/report/ReportDetailModal.jsx - รายละเอียดรายการในรายงาน (อ่านอย่างเดียว) โหลดด้วย Record ID จริง
import React, { useEffect, useState } from 'react';
import RIcon from './ReportIcons';
import VisitDetailView from './VisitDetailView';
import { api, fmtDate, fmtDateTime } from '../../lib/api';

const DATE_LABELS = new Set(['Visit Date', 'OT Date', 'Start Date', 'End Date']);
const DT_LABELS = new Set(['Completed At', 'Approved At']);
const TYPE_TITLE = { visit: 'Visit', ot: 'OT', leave: 'Leave' };

export default function ReportDetailModal({ type, id, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null); setError('');
    api.get(`/api/report/detail/${type}/${id}`).then(d => { if (alive) setData(d); }).catch(e => { if (alive) setError(e.message || 'ไม่สามารถโหลดรายละเอียดได้'); });
    return () => { alive = false; };
  }, [type, id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const fmtVal = (f) => (DATE_LABELS.has(f.label) ? fmtDate(f.value) : DT_LABELS.has(f.label) ? fmtDateTime(f.value) : f.value);
  const wide = (l) => ['Purpose', 'Work Detail', 'Reason', 'Notes', 'Approval Note', 'Completion Note', 'Accompanied By'].includes(l);

  return (
    <div className="rx-modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`rx-modal${data && data.visit ? ' rx-modal-visit' : ''}`} role="dialog" aria-modal="true" aria-label="รายละเอียดรายการ">
        <div className="rx-modal-head">
          <div>
            <div className="rx-modal-kicker">{TYPE_TITLE[type]} Request</div>
            <h3>{data ? `#${data.code}` : 'กำลังโหลด...'}</h3>
          </div>
          {data && <span className={`rx-badge s-${data.status}`}>{data.status_label}</span>}
          {data && data.visit && <a className="rx-pdfbtn" href={`/api/visit-requests/${id}/pdf`} target="_blank" rel="noreferrer">เปิด PDF</a>}
          <button type="button" className="rx-x" onClick={onClose} aria-label="ปิด"><RIcon name="x" size={20} /></button>
        </div>
        {data && data.visit && <div className="vd-ro">🔒 โหมดดูอย่างเดียว — แก้ไขได้เฉพาะเจ้าของคำขอที่หน้า Visit ของตัวเอง</div>}
        <div className={`rx-modal-body${data && data.visit ? ' vd-mode' : ''}`}>
          {error && <div className="rx-err">{error}</div>}
          {!data && !error && <div className="rx-skel-stack"><div className="rx-skel" /><div className="rx-skel" /><div className="rx-skel" style={{ width: '70%' }} /></div>}
          {data && data.visit && <VisitDetailView data={data} />}
          {data && !data.visit && (
            <>
              <dl className="rx-fields">
                {data.fields.map(f => (
                  <div key={f.label} className={wide(f.label) ? 'wide' : ''}><dt>{f.label}</dt><dd>{fmtVal(f)}</dd></div>
                ))}
              </dl>
              <h4 className="rx-h4">ประวัติการดำเนินการ</h4>
              {data.history.length ? (
                <ol className="rx-timeline">
                  {data.history.map((h, i) => (
                    <li key={i} style={{ '--i': i }}>
                      <b>{h.action}</b>
                      <span className="muted"> · {h.actor || 'ระบบ'} · {fmtDateTime(h.created_at)}</span>
                      {h.note && <div className="rx-note">{h.note}</div>}
                    </li>
                  ))}
                </ol>
              ) : <p className="muted" style={{ margin: 0 }}>ยังไม่มีประวัติการดำเนินการ</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
