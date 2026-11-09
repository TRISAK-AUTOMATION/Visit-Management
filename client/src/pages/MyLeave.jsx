// client/src/pages/MyLeave.jsx - รายการคำขอลาของตัวเอง
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import PageHero from '../components/PageHero';
import { api, fmtDate, fmtDateTime } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { useAuth } from '../lib/AuthContext';
import LeavePaperForm from '../components/LeavePaperForm';

const STATUS_TH = { draft: 'ฉบับร่าง', pending: 'รออนุมัติ', revision: 'รอแก้ไข', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว' };
const TABS = [{ f: 'all', label: 'ทั้งหมด' }, { f: 'draft', label: 'ฉบับร่าง' }, { f: 'pending', label: 'รออนุมัติ' }, { f: 'revision', label: 'รอแก้ไข' }, { f: 'approved', label: 'อนุมัติแล้ว' }, { f: 'rejected', label: 'ไม่อนุมัติ' }];

const WF_STATE_LABEL = { waiting: 'รอคิว', pending: 'กำลังพิจารณา', approved: 'ผ่านแล้ว', rejected: 'ไม่อนุมัติ', revision: 'ส่งกลับแก้ไข' };

function WorkflowTimeline({ workflow }) {
  if (!workflow) return null;
  return (
    <div style={{ marginTop: 4 }}>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>
        Workflow: {workflow.templateName || 'ระบบเดิม (อิงแผนก)'}
      </div>
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

function durationLabel(r) {
  if (r.leave_mode === 'full_day') return `${r.duration_days} วัน`;
  if (r.leave_mode === 'half_day_morning') return 'ครึ่งวัน (เช้า)';
  if (r.leave_mode === 'half_day_afternoon') return 'ครึ่งวัน (บ่าย)';
  return `${r.duration_hours} ชม. (${r.time_from}-${r.time_to})`;
}

export default function MyLeave() {
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const { me, refreshMyVisit } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // ขั้นตอนที่เลือกอยู่ผูกกับ URL (?status=) เพื่อให้เมนูซ้ายกับแท็บตรงกันเสมอ และกด back/ลิงก์ตรงมาได้
  const statusParam = searchParams.get('status');
  const tab = ['draft', 'pending', 'revision', 'approved', 'rejected'].includes(statusParam) ? statusParam : 'all';
  const setTab = (f) => setSearchParams(f === 'all' ? {} : { status: f });
  const [detail, setDetail] = useState(null);

  const load = async () => {
    try {
      const { requests } = await api.get('/api/leave-requests?scope=mine');
      setRows(requests);
    } catch (err) { toast(`โหลดรายการไม่สำเร็จ: ${err.message}`, 'error'); }
    refreshMyVisit(); // อัปเดตตัวเลขแต่ละขั้นตอนที่เมนูซ้าย
  };
  useEffect(() => { load(); }, []);

  const filtered = tab === 'all' ? rows : rows.filter(r => r.status === tab);

  const openDetail = async (id) => {
    try {
      const d = await api.get(`/api/leave-requests/${id}`);
      setDetail(d);
    } catch (err) { toast(`เปิดคำขอไม่สำเร็จ: ${err.message}`, 'error'); }
  };

  const submitDraft = async (id) => {
    try { await api.post(`/api/leave-requests/${id}/submit`); toast('ส่งคำขอสำเร็จ', 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  const adminCancel = async (id) => {
    const note = prompt('ยกเลิกใบลาที่อนุมัติแล้ว — ระบบจะคืนวันลาให้\nระบุเหตุผล (ถ้ามี):');
    if (note === null) return;
    try { await api.post(`/api/leave-requests/${id}/cancel`, { note }); toast('ยกเลิกใบลาและคืนวันลาแล้ว', 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  const cancelReq = async (id, isDraft) => {
    if (!confirm(isDraft ? 'ยืนยันลบฉบับร่างนี้หรือไม่?' : 'ยืนยันยกเลิกคำขอนี้หรือไม่?')) return;
    try { await api.post(`/api/leave-requests/${id}/cancel`); toast(isDraft ? 'ลบฉบับร่างสำเร็จ' : 'ยกเลิกคำขอสำเร็จ', 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  const resubmit = async (id) => {
    try {
      await api.post(`/api/leave-requests/${id}/resubmit`);
      toast('ส่งคำขอใหม่สำเร็จ', 'success');
      setDetail(null);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <Layout title="การลาของฉัน (My Leave)">
      <PageHero icon="umbrella" tone="green" title="การลาของฉัน" desc="ติดตามสถานะคำขอลาและสิทธิ์วันลาคงเหลือ" />
      <div className="flex between mb-16">
        <div className="tabs">
          {TABS.map(t => <div key={t.f} className={`tab ${tab === t.f ? 'active' : ''}`} onClick={() => setTab(t.f)}>{t.label}</div>)}
        </div>
        <Link className="btn btn-primary" to="/leave-request">+ สร้างคำขอลา</Link>
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>เลขที่</th><th>ประเภท</th><th>วันที่</th><th>จำนวน</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>
              {filtered.length ? filtered.map(r => (
                <tr key={r.id}>
                  <td>{r.code}</td>
                  <td>{r.leave_type}</td>
                  <td>{fmtDate(r.date_from)}{r.date_to !== r.date_from ? ` - ${fmtDate(r.date_to)}` : ''}</td>
                  <td>{durationLabel(r)}</td>
                  <td><span className={`badge ${r.status}`}>{STATUS_TH[r.status]}</span></td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => openDetail(r.id)}>ดูรายละเอียด</button>{' '}
                    {r.status === 'approved' && <><a className="btn btn-outline btn-sm" href={`/api/leave-requests/${r.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>{' '}</>}
                    {r.status === 'approved' && me.role === 'Admin' && <><button className="btn btn-danger btn-sm" onClick={() => adminCancel(r.id)}>ยกเลิก</button>{' '}</>}
                    {['draft', 'pending', 'revision'].includes(r.status) && (
                      <>
                        {/* ห้ามแก้ไขตอน pending เพราะกำลังอยู่ระหว่างอนุมัติ (อาจผ่านบาง State ไปแล้ว) - แก้ได้เฉพาะ draft/revision */}
                        {['draft', 'revision'].includes(r.status) && (
                          <button className="btn btn-outline btn-sm" onClick={() => navigate(`/leave-request?id=${r.id}`)}>แก้ไข</button>
                        )}{' '}
                        {r.status === 'draft' && <button className="btn btn-success btn-sm" onClick={() => submitDraft(r.id)}>ส่งคำขอ</button>}{' '}
                        {r.status === 'revision' && <button className="btn btn-success btn-sm" onClick={() => resubmit(r.id)}>ส่งใหม่</button>}{' '}
                        <button className="btn btn-danger btn-sm" onClick={() => cancelReq(r.id, r.status === 'draft')}>{r.status === 'draft' ? 'ลบ' : 'ยกเลิก'}</button>
                      </>
                    )}
                  </td>
                </tr>
              )) : <tr><td colSpan={6} className="empty">ไม่มีคำขอลาในหมวดนี้</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="modal modal-paper">
            <div className="modal-head"><h3>รายละเอียดคำขอลา #{detail.request.code}</h3><button className="modal-close" onClick={() => setDetail(null)}>×</button></div>
            <div className="modal-body">
              <LeavePaperForm r={detail.request} paper={detail.paper} />
              {detail.request.attachment && <p><a href={detail.request.attachment} download>ดาวน์โหลดเอกสารแนบ</a></p>}
              <p><b>สถานะ:</b> <span className={`badge ${detail.request.status}`}>{STATUS_TH[detail.request.status]}</span></p>
              {detail.request.status === 'approved' && <p><a className="btn btn-outline btn-sm" href={`/api/leave-requests/${detail.request.id}/pdf`} target="_blank" rel="noreferrer">เปิด/พิมพ์ใบลา PDF</a></p>}
              {detail.request.approval_note && <p><b>ความเห็นผู้อนุมัติ:</b> {detail.request.approval_note}</p>}
              {detail.request.status === 'revision' && (
                <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 4, marginBottom: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => navigate(`/leave-request?id=${detail.request.id}`)}>แก้ไขคำขอ</button>
                  <button className="btn btn-success btn-sm" onClick={() => resubmit(detail.request.id)}>ส่งคำขอใหม่ (เริ่มอนุมัติใหม่)</button>
                </div>
              )}
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '14px 0' }} />
              <b>ขั้นตอนการอนุมัติ</b>
              <WorkflowTimeline workflow={detail.workflow} />
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '14px 0' }} />
              <b>ประวัติการดำเนินการ</b>
              <div style={{ marginTop: 8 }}>
                {detail.history.map(h => (
                  <div key={h.id} style={{ fontSize: 12.5, padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
                    <b>{h.action}</b> โดย {h.actor_name || 'ระบบ'} · {fmtDateTime(h.created_at)}
                    {h.note && <div className="muted">{h.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
