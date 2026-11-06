// client/src/components/RequestModal.jsx - เทียบเท่า viewRequest() modal เดิมในหน้า my-requests.html / approve-requests.html
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDate, fmtDateTime, statusLabel, channelLabel } from '../lib/api';
import VisitExtraDetails, { hasVisitExtras } from './VisitExtraDetails';

const WF_STATE_LABEL = { waiting: 'รอคิว', pending: 'กำลังพิจารณา', approved: 'ผ่านแล้ว', rejected: 'ไม่อนุมัติ', revision: 'ส่งกลับแก้ไข' };

export function WorkflowTimeline({ workflow }) {
  if (!workflow) return null;
  return (
    <div style={{ marginTop: 4 }}>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Workflow: {workflow.templateName || 'ระบบเดิม (อิงแผนก)'}</div>
      {workflow.states.map((s, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0',
          borderLeft: `3px solid ${s.status === 'approved' ? '#1fae62' : s.status === 'rejected' ? '#d93a30' : s.status === 'revision' ? '#c9670f' : i === workflow.currentStateIndex ? '#2f5bff' : '#dfe3ea'}`,
          paddingLeft: 10, opacity: s.status === 'waiting' ? 0.6 : 1
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 12.5 }}>
              {i + 1}. {s.name} <span className="muted" style={{ fontWeight: 400 }}>({s.mode === 'ALL' ? 'ทุกคนต้องอนุมัติ' : 'คนใดคนหนึ่งอนุมัติ'})</span>
            </div>
            <div className="muted" style={{ fontSize: 11.5 }}>{WF_STATE_LABEL[s.status] || s.status}</div>
            {s.approvers.map(a => (
              <div key={a.user_id} style={{ fontSize: 11.5, marginTop: 2 }}>
                {a.full_name}{a.decision ? ` · ${a.decision === 'approve' ? 'อนุมัติ' : a.decision === 'reject' ? 'ไม่อนุมัติ' : 'ส่งกลับแก้ไข'}` : ''}
                {a.comment && <span className="muted"> — {a.comment}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// mode: 'mine' (แสดงประวัติ+ปุ่มพิมพ์) หรือ 'approve' (แสดงข้อมูลผู้ขอ+ปุ่มอนุมัติ/ไม่อนุมัติ/ส่งกลับแก้ไข)
// หรือ 'calendar' (แสดงข้อมูลผู้ขอ+ผู้อนุมัติ แบบอ่านอย่างเดียว - ใช้จากหน้าปฏิทิน)
export default function RequestModal({ request, history, customFields, workflow, customerSignature, mode, onClose, onDecide, onRequestRevision, canAct = true, canResync = false, onResync }) {
  const navigate = useNavigate();
  const canPrint = !['draft', 'revision'].includes(request.status);

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={hasVisitExtras(request) ? { width: 720 } : undefined}>
        <div className="modal-head">
          <h3>{mode === 'mine' ? `รายละเอียดคำขอ #${request.code}` : `คำขอ #${request.code}`}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-actions" style={{ justifyContent: 'flex-start', marginBottom: 12 }}>
            {canPrint && (
              <a className="btn btn-outline btn-sm" href={`/api/visit-requests/${request.id}/pdf`} target="_blank" rel="noreferrer">
                &#128196; พิมพ์ / ดูตัวอย่าง PDF
              </a>
            )}
            {mode === 'mine' && ['draft', 'revision'].includes(request.status) && (
              <button className="btn btn-outline btn-sm" onClick={() => { onClose(); navigate(`/visit-request?id=${request.id}`); }}>
                &#9998; แก้ไขคำขอ
              </button>
            )}
            {mode === 'mine' && request.status === 'approved' && (
              <button className="btn btn-outline btn-sm" onClick={() => { onClose(); navigate(`/visit-request?id=${request.id}`); }}>
                &#9998; อัปเดตข้อมูลหลังปฏิบัติงาน
              </button>
            )}
          </div>
          {(mode === 'approve' || mode === 'calendar') && (
            <p><b>ผู้ขอ:</b> {request.requester_name} ({request.requester_position || '-'}) {request.requester_department ? `· แผนก ${request.requester_department}` : ''}</p>
          )}
          {request.status === 'approved' && request.completed_at && (
            <p style={{ background: '#d5f5f0', color: '#0f766e', padding: '6px 10px', borderRadius: 8 }}>
              <b>Visit Completed</b> · {fmtDateTime(request.completed_at)}{request.completion_note ? ` — ${request.completion_note}` : ''}
            </p>
          )}
          <p><b>ลูกค้า/บริษัท:</b> {request.customer_name || '-'}</p>
          <p><b>วันที่:</b> {fmtDate(request.visit_date)} &nbsp; <b>เวลา:</b> {request.time_from} - {request.time_to}</p>
          <p><b>วัตถุประสงค์:</b> {request.purpose || '-'}</p>
          <p><b>สถานที่:</b> {request.location || '-'}</p>
          <p><b>ผู้ติดต่อ:</b> {request.contact_person || '-'} {request.contact_phone ? `(${request.contact_phone})` : ''}</p>
          {request.participants && <p><b>ผู้ร่วมงาน:</b> {request.participants}</p>}
          {mode === 'mine' && (
            <p><b>ยานพาหนะ:</b> {request.transport || '-'} {request.license_plate ? `· ${request.license_plate}` : ''}</p>
          )}
          <p><b>สถานะ:</b> <span className={`badge ${request.status}`}>{statusLabel(request.status)}</span></p>
          {mode === 'calendar' && request.approver_name && (
            <p><b>ผู้อนุมัติ:</b> {request.approver_name}</p>
          )}
          <VisitExtraDetails request={request} />
          {customFields && customFields.length > 0 && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
              {customFields.filter(f => f.value).map(f => {
                let display = f.value;
                if (f.field_type === 'multiselect') {
                  try { display = JSON.parse(f.value).join(', '); } catch (e) { /* keep raw */ }
                } else if (f.field_type === 'checkbox') {
                  display = f.value === 'true' ? 'ใช่' : 'ไม่ใช่';
                } else if (f.field_type === 'file') {
                  display = <a href={f.value} download>ดาวน์โหลดไฟล์แนบ</a>;
                }
                return <p key={f.field_key}><b>{f.label}:</b> {display}</p>;
              })}
            </>
          )}
          {(customerSignature || request.status === 'approved') && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
              <b>ลายเซ็นลูกค้า</b>
              {customerSignature ? (
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: '#fff', padding: 6 }}>
                    <img src={customerSignature.data_url} alt="ลายเซ็นลูกค้า" style={{ display: 'block', maxWidth: 220, maxHeight: 100 }} />
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                    <div><b>{customerSignature.signer_name}</b>{customerSignature.signer_title ? ` · ${customerSignature.signer_title}` : ''}</div>
                    <div className="muted">เซ็นเมื่อ {fmtDateTime(customerSignature.signed_at)}</div>
                  </div>
                </div>
              ) : <p className="muted" style={{ margin: '6px 0 0' }}>ยังไม่มีลายเซ็นลูกค้า</p>}
            </>
          )}
          {request.approval_note && (
            <p><b>{request.status === 'revision' ? 'สิ่งที่ต้องแก้ไข' : 'ความคิดเห็นผู้อนุมัติ'}:</b> {request.approval_note}</p>
          )}

          {workflow && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
              <b>ขั้นตอนการอนุมัติ</b>
              <WorkflowTimeline workflow={workflow} />
            </>
          )}

          {mode === 'approve' && request.status === 'pending' && !canAct && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#fff7e6', border: '1px solid #f5d9a0', borderRadius: 9, fontSize: 13, color: '#8a5a00' }}>
              คุณไม่ได้อยู่ในลำดับผู้อนุมัติของคำขอนี้ในขั้นตอนปัจจุบัน จึงอนุมัติ/ไม่อนุมัติไม่ได้
              {canResync && onResync && (
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => { onResync(request.id); onClose(); }}>รีเซ็ตสายอนุมัติตามรายชื่อล่าสุด</button>
                </div>
              )}
            </div>
          )}
          {mode === 'approve' && request.status === 'pending' && canAct && (
            <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
              <button className="btn btn-success" onClick={() => { onDecide(request.id, 'approve'); onClose(); }}>อนุมัติ</button>
              <button className="btn btn-danger" onClick={() => { onDecide(request.id, 'reject'); onClose(); }}>ไม่อนุมัติ</button>
              {onRequestRevision && (
                <button className="btn btn-outline" onClick={() => { onRequestRevision(request.id); onClose(); }}>ส่งกลับแก้ไข</button>
              )}
            </div>
          )}

          {mode === 'approve' && request.status === 'pending' && (() => {
            // คำขอที่ถูกแก้ไขหลังอนุมัติแล้วส่งกลับมาให้อนุมัติอีกครั้ง: โชว์รายการที่เปลี่ยนล่าสุด (ถ้ามี) ให้ผู้อนุมัติเห็น
            const list = history || [];
            const idx = list.reduce((m, h, i) => (h.action && h.action.startsWith('แก้ไขหลังอนุมัติ') ? i : m), -1);
            if (idx < 0) return null;
            const h = list[idx];
            const reopenedAfter = list.slice(idx + 1).some(x => x.action && (x.action.startsWith('ส่งคำขอ') || x.action.startsWith('แก้ไขหลังอนุมัติ')));
            if (reopenedAfter) return null;
            return (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#eef3ff', border: '1px solid #c9d6ff', borderRadius: 9, fontSize: 13 }}>
                <b>คำขอนี้ถูกแก้ไขหลังอนุมัติ — กรุณาตรวจสอบและอนุมัติอีกครั้ง</b>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>แก้ไขโดย {h.actor_name || 'ผู้ขอ'} · {fmtDateTime(h.created_at)}</div>
                <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{h.note || '-'}</div>
              </div>
            );
          })()}

          {mode === 'mine' && history && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '14px 0' }} />
              <b>ประวัติการดำเนินการ</b>
              <div style={{ marginTop: 8 }}>
                {history.map(h => (
                  <div key={h.id} style={{ fontSize: 12.5, padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
                    <b>{h.action}</b> โดย {h.actor_name || 'ระบบ'} {h.channel ? `· ผ่าน${channelLabel(h.channel)}` : ''} · {fmtDateTime(h.created_at)}
                    {h.note && <div className="muted">{h.note}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
