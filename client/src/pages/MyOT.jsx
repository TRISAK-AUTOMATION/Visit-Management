// client/src/pages/MyOT.jsx - รายการคำขอ OT ของตัวเอง
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { api, fmtDate, fmtDateTime } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const STATUS_TH = { draft: 'ฉบับร่าง', pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว' };
const TABS = [{ f: 'all', label: 'ทั้งหมด' }, { f: 'draft', label: 'ฉบับร่าง' }, { f: 'pending', label: 'รออนุมัติ' }, { f: 'approved', label: 'อนุมัติแล้ว' }, { f: 'rejected', label: 'ไม่อนุมัติ' }];

export default function MyOT() {
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('all');
  const [detail, setDetail] = useState(null);

  const load = async () => {
    const { requests } = await api.get('/api/ot-requests?scope=mine');
    setRows(requests);
  };
  useEffect(() => { load(); }, []);

  const filtered = tab === 'all' ? rows : rows.filter(r => r.status === tab);

  const openDetail = async (id) => {
    const d = await api.get(`/api/ot-requests/${id}`);
    setDetail(d);
  };

  const submitDraft = async (id) => {
    try { await api.post(`/api/ot-requests/${id}/submit`); toast('ส่งคำขอสำเร็จ', 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  const cancelReq = async (id, isDraft) => {
    if (!confirm(isDraft ? 'ยืนยันลบฉบับร่างนี้หรือไม่?' : 'ยืนยันยกเลิกคำขอนี้หรือไม่?')) return;
    try { await api.post(`/api/ot-requests/${id}/cancel`); toast(isDraft ? 'ลบฉบับร่างสำเร็จ' : 'ยกเลิกคำขอสำเร็จ', 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <Layout title="OT ของฉัน (My Overtime)">
      <div className="flex between mb-16">
        <div className="tabs">
          {TABS.map(t => <div key={t.f} className={`tab ${tab === t.f ? 'active' : ''}`} onClick={() => setTab(t.f)}>{t.label}</div>)}
        </div>
        <Link className="btn btn-primary" to="/ot-request">+ สร้างคำขอ OT</Link>
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>เลขที่</th><th>วันที่ทำ OT</th><th>เวลา</th><th>ชั่วโมง</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>
              {filtered.length ? filtered.map(r => (
                <tr key={r.id}>
                  <td>{r.code}</td>
                  <td>{fmtDate(r.ot_date)}</td>
                  <td>{r.time_from} - {r.time_to}</td>
                  <td>{r.hours} ชม.</td>
                  <td><span className={`badge ${r.status}`}>{STATUS_TH[r.status]}</span></td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => openDetail(r.id)}>ดูรายละเอียด</button>{' '}
                    {r.status === 'approved' && (
                      <a className="btn btn-outline btn-sm" href={`/api/ot-requests/${r.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                    )}{' '}
                    {['draft', 'pending'].includes(r.status) && (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => navigate(`/ot-request?id=${r.id}`)}>แก้ไข</button>{' '}
                        {r.status === 'draft' && <button className="btn btn-success btn-sm" onClick={() => submitDraft(r.id)}>ส่งคำขอ</button>}{' '}
                        <button className="btn btn-danger btn-sm" onClick={() => cancelReq(r.id, r.status === 'draft')}>{r.status === 'draft' ? 'ลบ' : 'ยกเลิก'}</button>
                      </>
                    )}
                  </td>
                </tr>
              )) : <tr><td colSpan={6} className="empty">ไม่มีคำขอ OT ในหมวดนี้</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="modal">
            <div className="modal-head"><h3>รายละเอียดคำขอ OT #{detail.request.code}</h3><button className="modal-close" onClick={() => setDetail(null)}>×</button></div>
            <div className="modal-body">
              <p><b>วันที่:</b> {fmtDate(detail.request.ot_date)}</p>
              <p><b>เวลา:</b> {detail.request.time_from} - {detail.request.time_to} ({detail.request.hours} ชม.)</p>
              <p><b>สถานที่:</b> {detail.request.location || '-'}</p>
              <p><b>รายละเอียดงาน:</b> {detail.request.work_detail || '-'}</p>
              <p><b>เหตุผล:</b> {detail.request.reason || '-'}</p>
              {detail.request.notes && <p><b>หมายเหตุ:</b> {detail.request.notes}</p>}
              <p><b>สถานะ:</b> <span className={`badge ${detail.request.status}`}>{STATUS_TH[detail.request.status]}</span></p>
              {detail.request.approval_note && <p><b>ความเห็นผู้อนุมัติ:</b> {detail.request.approval_note}</p>}
              {detail.request.status === 'approved' && (
                <p><a className="btn btn-outline btn-sm" href={`/api/ot-requests/${detail.request.id}/pdf`} target="_blank" rel="noreferrer">เปิด/ดาวน์โหลด PDF</a></p>
              )}
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
