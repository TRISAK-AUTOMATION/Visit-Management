// client/src/pages/ApproveOT.jsx - หน้าอนุมัติคำขอ OT (Approver/Admin)
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { api, fmtDate, fmtDateTime } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { useAuth } from '../lib/AuthContext';

const TABS = [{ f: 'pending', label: 'รออนุมัติ' }, { f: 'approved', label: 'อนุมัติแล้ว' }, { f: 'rejected', label: 'ไม่อนุมัติ' }, { f: 'revision', label: 'ส่งกลับแก้ไข' }];

const WF_STATE_LABEL = { waiting: 'รอคิว', pending: 'กำลังพิจารณา', approved: 'ผ่านแล้ว', rejected: 'ไม่อนุมัติ', revision: 'ส่งกลับแก้ไข' };

function WorkflowTimeline({ workflow }) {
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

export default function ApproveOT() {
  const toast = useToast();
  const { refreshBadges } = useAuth();
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState(() => { const s = new URLSearchParams(window.location.search).get('status'); return ['pending','approved','rejected','revision'].includes(s) ? s : 'pending'; });
  const [detail, setDetail] = useState(null);

  const load = async (status = tab) => {
    const { requests } = await api.get(`/api/ot-requests?scope=pending&status=${status}`);
    setRows(requests);
    refreshBadges(); // อัปเดตตัวเลขแจ้งเตือนข้างเมนู/กระดิ่งให้ตรงกับรายการล่าสุด
  };
  useEffect(() => { load(tab); }, [tab]);

  const openDetail = async (id) => {
    const d = await api.get(`/api/ot-requests/${id}`);
    setDetail(d);
  };

  // Admin: ให้ OT ที่ค้างอยู่ใช้รายชื่อผู้อนุมัติล่าสุดตาม Template (เฉพาะใบที่ยังไม่มีใครตัดสินใจ)
  const resync = async (id) => {
    if (!window.confirm('รีเซ็ตสายอนุมัติของคำขอนี้ให้ใช้รายชื่อผู้อนุมัติล่าสุดตาม Template?\n(ทำได้เฉพาะใบที่ยังไม่มีใครตัดสินใจ และจะแจ้งเตือนผู้อนุมัติชุดใหม่)')) return;
    try {
      const r = await api.post(`/api/ot-requests/${id}/resync-workflow`);
      toast(`รีเซ็ตสายอนุมัติแล้ว — รอ ${(r.waiting_for || []).join(', ') || 'ผู้อนุมัติ'}`, 'success');
      setDetail(null);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const decide = async (id, action) => {
    const promptText = action === 'approve' ? 'ความคิดเห็น (ถ้ามี) ก่อนอนุมัติ:' : action === 'revision' ? 'ระบุสิ่งที่ต้องแก้ไข:' : 'เหตุผลที่ไม่อนุมัติ:';
    const note = prompt(promptText, '') || '';
    if (action === 'revision' && !note.trim()) { toast('กรุณาระบุสิ่งที่ต้องแก้ไข', 'error'); return; }
    try {
      await api.post(`/api/ot-requests/${id}/${action}`, { note });
      toast(action === 'approve' ? 'อนุมัติคำขอ OT สำเร็จ' : action === 'revision' ? 'ส่งกลับให้แก้ไขแล้ว' : 'บันทึกการไม่อนุมัติแล้ว', 'success');
      setDetail(null);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <Layout title="อนุมัติ OT (Approve Overtime)">
      <div className="tabs">
        {TABS.map(t => <div key={t.f} className={`tab ${tab === t.f ? 'active' : ''}`} onClick={() => setTab(t.f)}>{t.label}</div>)}
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>วันที่ยื่น</th><th>ผู้ขอ</th><th>วันที่ทำ OT</th><th>เวลา</th><th>ชั่วโมง</th><th>จัดการ</th></tr></thead>
            <tbody>
              {rows.length ? rows.map(r => (
                <tr key={r.id} style={r.status === 'pending' && r.is_update ? { background: '#fff8ea', boxShadow: 'inset 4px 0 0 #f5a524' } : undefined}>
                  <td>
                    {r.status === 'pending' && (r.is_update
                      ? <span className="req-tag upd">Updated</span>
                      : <span className="req-tag new">New OT</span>)}
                    <div>{fmtDateTime(r.created_at)}</div>
                  </td>
                  <td>{r.requester_name} {r.requester_department ? `· ${r.requester_department}` : ''}</td>
                  <td>{fmtDate(r.ot_date)}</td>
                  <td>{r.time_from} - {r.time_to}</td>
                  <td>{r.hours} ชม.</td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => openDetail(r.id)}>ดู</button>{' '}
                    {r.status === 'pending' && r.can_act && (
                      <>
                        <button className="btn btn-success btn-sm" onClick={() => decide(r.id, 'approve')}>อนุมัติ</button>{' '}
                        <button className="btn btn-outline btn-sm" onClick={() => decide(r.id, 'revision')}>ส่งกลับแก้ไข</button>{' '}
                        <button className="btn btn-danger btn-sm" onClick={() => decide(r.id, 'reject')}>ไม่อนุมัติ</button>
                      </>
                    )}
                    {r.status === 'pending' && !r.can_act && (
                      <>
                        <span className="muted" style={{ fontSize: 12.5 }}>รอ {r.waiting_for || 'ผู้อนุมัติ'} อนุมัติ</span>{' '}
                        {r.can_resync && <button className="btn btn-outline btn-sm" onClick={() => resync(r.id)}>รีเซ็ตสายอนุมัติ</button>}
                      </>
                    )}
                  </td>
                </tr>
              )) : <tr><td colSpan={6} className="empty">ไม่มีรายการในหมวดนี้</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="modal">
            <div className="modal-head"><h3>คำขอ OT #{detail.request.code}</h3><button className="modal-close" onClick={() => setDetail(null)}>×</button></div>
            <div className="modal-body">
              <p><b>ผู้ขอ:</b> {detail.request.requester_name} ({detail.request.requester_department || '-'})</p>
              <p><b>วันที่:</b> {fmtDate(detail.request.ot_date)}{detail.request.day_type ? ` (${detail.request.day_type === 'holiday' ? 'วันหยุด' : 'วันทำงาน'})` : ''}</p>
              <p><b>เวลา:</b> {detail.request.time_from} - {detail.request.time_to} ({detail.request.hours} ชม.)</p>
              <p><b>สถานที่:</b> {detail.request.location || '-'}</p>
              <p><b>OT Type:</b> {detail.request.ot_type || '-'}</p>
              <p><b>ลูกค้า:</b> {detail.request.customer_name ? `${detail.request.customer_code || ''} - ${detail.request.customer_name}` : '-'}</p>
              <p><b>Project No.:</b> {detail.request.project_no || '-'} &nbsp; <b>Job No.:</b> {detail.request.job_no || '-'}</p>
              <p><b>รายละเอียดงาน:</b> {detail.request.work_detail || '-'}</p>
              <p><b>เหตุผล:</b> {detail.request.reason || '-'}</p>
              {detail.request.notes && <p><b>หมายเหตุ:</b> {detail.request.notes}</p>}
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '14px 0' }} />
              <b>ขั้นตอนการอนุมัติ</b>
              <WorkflowTimeline workflow={detail.workflow} />
              {detail.request.status === 'pending' && detail.can_act && (
                <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
                  <button className="btn btn-success" onClick={() => decide(detail.request.id, 'approve')}>อนุมัติ</button>
                  <button className="btn btn-outline" onClick={() => decide(detail.request.id, 'revision')}>ส่งกลับแก้ไข</button>
                  <button className="btn btn-danger" onClick={() => decide(detail.request.id, 'reject')}>ไม่อนุมัติ</button>
                </div>
              )}
              {detail.request.status === 'pending' && !detail.can_act && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#fff7e6', border: '1px solid #f5d9a0', borderRadius: 9, fontSize: 13, color: '#8a5a00' }}>
                  คุณไม่ได้อยู่ในลำดับผู้อนุมัติของคำขอนี้ในขั้นตอนปัจจุบัน จึงอนุมัติ/ไม่อนุมัติไม่ได้
                  {detail.can_resync && (
                    <div style={{ marginTop: 8 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => resync(detail.request.id)}>รีเซ็ตสายอนุมัติตามรายชื่อล่าสุด</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
