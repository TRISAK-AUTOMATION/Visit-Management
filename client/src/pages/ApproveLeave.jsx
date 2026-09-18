// client/src/pages/ApproveLeave.jsx - หน้าอนุมัติคำขอลา (Approver/Admin)
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { api, fmtDate } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const TABS = [{ f: 'pending', label: 'รออนุมัติ' }, { f: 'approved', label: 'อนุมัติแล้ว' }, { f: 'rejected', label: 'ไม่อนุมัติ' }];

function durationLabel(r) {
  if (r.leave_mode === 'full_day') return `${r.duration_days} วัน`;
  if (r.leave_mode === 'half_day_morning') return 'ครึ่งวัน (เช้า)';
  if (r.leave_mode === 'half_day_afternoon') return 'ครึ่งวัน (บ่าย)';
  return `${r.duration_hours} ชม. (${r.time_from}-${r.time_to})`;
}

export default function ApproveLeave() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('pending');
  const [detail, setDetail] = useState(null);

  const load = async (status = tab) => {
    const { requests } = await api.get(`/api/leave-requests?scope=pending&status=${status}`);
    setRows(requests);
  };
  useEffect(() => { load(tab); }, [tab]);

  const openDetail = async (id) => {
    const d = await api.get(`/api/leave-requests/${id}`);
    setDetail(d);
  };

  const decide = async (id, action) => {
    const note = prompt(action === 'approve' ? 'ความคิดเห็น (ถ้ามี) ก่อนอนุมัติ:' : 'เหตุผลที่ไม่อนุมัติ:', '') || '';
    try {
      await api.post(`/api/leave-requests/${id}/${action}`, { note });
      toast(action === 'approve' ? 'อนุมัติคำขอลาสำเร็จ' : 'บันทึกการไม่อนุมัติแล้ว', 'success');
      setDetail(null);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <Layout title="อนุมัติการลา (Approve Leave)">
      <div className="tabs">
        {TABS.map(t => <div key={t.f} className={`tab ${tab === t.f ? 'active' : ''}`} onClick={() => setTab(t.f)}>{t.label}</div>)}
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>วันที่ยื่น</th><th>ผู้ขอ</th><th>ประเภท</th><th>วันที่ลา</th><th>จำนวน</th><th>จัดการ</th></tr></thead>
            <tbody>
              {rows.length ? rows.map(r => (
                <tr key={r.id}>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>{r.requester_name} {r.requester_department ? `· ${r.requester_department}` : ''}</td>
                  <td>{r.leave_type}</td>
                  <td>{fmtDate(r.date_from)}{r.date_to !== r.date_from ? ` - ${fmtDate(r.date_to)}` : ''}</td>
                  <td>{durationLabel(r)}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => openDetail(r.id)}>ดู</button>{' '}
                    {r.status === 'pending' && (
                      <>
                        <button className="btn btn-success btn-sm" onClick={() => decide(r.id, 'approve')}>อนุมัติ</button>{' '}
                        <button className="btn btn-danger btn-sm" onClick={() => decide(r.id, 'reject')}>ไม่อนุมัติ</button>
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
            <div className="modal-head"><h3>คำขอลา #{detail.request.code}</h3><button className="modal-close" onClick={() => setDetail(null)}>×</button></div>
            <div className="modal-body">
              <p><b>ผู้ขอ:</b> {detail.request.requester_name} ({detail.request.requester_department || '-'})</p>
              <p><b>ประเภท:</b> {detail.request.leave_type}</p>
              <p><b>วันที่:</b> {fmtDate(detail.request.date_from)}{detail.request.date_to !== detail.request.date_from ? ` - ${fmtDate(detail.request.date_to)}` : ''}</p>
              <p><b>จำนวน:</b> {durationLabel(detail.request)}</p>
              <p><b>เหตุผล:</b> {detail.request.reason || '-'}</p>
              {detail.request.attachment && <p><a href={detail.request.attachment} download>ดาวน์โหลดเอกสารแนบ</a></p>}
              {detail.request.status === 'pending' && (
                <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
                  <button className="btn btn-success" onClick={() => decide(detail.request.id, 'approve')}>อนุมัติ</button>
                  <button className="btn btn-danger" onClick={() => decide(detail.request.id, 'reject')}>ไม่อนุมัติ</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
