// client/src/pages/ApproveRequests.jsx - เทียบเท่า public/approve-requests.html
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { usePageContent } from '../lib/PageContentContext';
import ReportDetailModal from '../components/report/ReportDetailModal';
import '../components/report/report-ui.css';
import { api, fmtDate, fmtDateTime } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { useAuth } from '../lib/AuthContext';

const TABS = [
  { f: 'pending', label: 'รออนุมัติ' },
  { f: 'approved', label: 'อนุมัติแล้ว' },
  { f: 'rejected', label: 'ไม่อนุมัติ' }
];

export default function ApproveRequests() {
  const { pc } = usePageContent();
  const toast = useToast();
  const { refreshBadges } = useAuth();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState(() => { const s = new URLSearchParams(window.location.search).get('status'); return ['pending','approved','rejected','revision'].includes(s) ? s : 'pending'; });
  const [modalData, setModalData] = useState(null);

  const load = async (f = filter) => {
    const { requests } = await api.get(`/api/visit-requests?scope=pending&status=${f}`);
    setRows(requests);
    refreshBadges(); // อัปเดตตัวเลขแจ้งเตือนข้างเมนู/กระดิ่งให้ตรงกับรายการล่าสุด
  };

  useEffect(() => { load(filter); }, [filter]);

  // รองรับลิงก์เข้ามาจากอีเมล เช่น /approve-requests?id=12 ให้เปิด modal อัตโนมัติ
  useEffect(() => {
    const id = searchParams.get('id');
    if (id) viewRequest(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const decide = async (id, action) => {
    const note = prompt(action === 'approve' ? 'ความคิดเห็น (ถ้ามี) ก่อนอนุมัติ:' : 'เหตุผลที่ไม่อนุมัติ:', '') || '';
    try {
      await api.post(`/api/visit-requests/${id}/${action}`, { note });
      toast(action === 'approve' ? 'อนุมัติคำขอสำเร็จ' : 'บันทึกการไม่อนุมัติแล้ว', 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const requestRevision = async (id) => {
    const note = prompt('ระบุสิ่งที่ต้องการให้ผู้ขอแก้ไข:', '');
    if (note === null) return;
    if (!note.trim()) { toast('กรุณาระบุเหตุผล', 'error'); return; }
    try {
      await api.post(`/api/visit-requests/${id}/request-revision`, { note });
      toast('ส่งคำขอกลับให้แก้ไขแล้ว', 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const viewRequest = async (id) => {
    const data = await api.get(`/api/visit-requests/${id}`);
    setModalData(data);
  };

  // Admin: ให้คำขอที่ค้างอยู่ใช้รายชื่อผู้อนุมัติล่าสุดตาม Template (เช่น เพิ่มผู้อนุมัติใหม่หลังส่งคำขอไปแล้ว)
  const resync = async (id) => {
    if (!window.confirm('รีเซ็ตสายอนุมัติของคำขอนี้ให้ใช้รายชื่อผู้อนุมัติล่าสุดตาม Template?\n(ทำได้เฉพาะใบที่ยังไม่มีใครตัดสินใจ และจะแจ้งเตือนผู้อนุมัติชุดใหม่)')) return;
    try {
      const r = await api.post(`/api/visit-requests/${id}/resync-workflow`);
      toast(`รีเซ็ตสายอนุมัติแล้ว — รอ ${(r.waiting_for || []).join(', ') || 'ผู้อนุมัติ'}`, 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <Layout title={pc('approve_requests.title', 'Approve Requests')}>
      <div className="tabs">
        {TABS.map(t => (
          <div key={t.f} className={`tab ${filter === t.f ? 'active' : ''}`} onClick={() => setFilter(t.f)}>{t.label}</div>
        ))}
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>เลขที่เอกสาร</th><th>วันที่</th><th>ผู้ขอ</th><th>ลูกค้า / บริษัท</th><th>เวลา</th><th>วัตถุประสงค์</th><th>จัดการ</th></tr>
            </thead>
            <tbody>
              {rows.length ? rows.map(v => (
                <tr key={v.id} style={v.is_update ? { background: '#fff8ea', boxShadow: 'inset 4px 0 0 #f5a524' } : undefined}>
                  <td className="nowrap"><b>{v.code}</b></td>
                  <td>
                    {v.status === 'pending' && (v.is_update
                      ? <span className="req-tag upd">Updated</span>
                      : <span className="req-tag new">New Visit</span>)}
                    <div>{fmtDate(v.visit_date)}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>ส่งเมื่อ {fmtDateTime(v.created_at)}</div>
                  </td>
                  <td>{v.requester_name}</td>
                  <td>
                    {v.customer_name}
                    {v.is_update && v.update_summary && (
                      <div style={{ fontSize: 11.5, color: '#8a5a00', marginTop: 4, whiteSpace: 'pre-line' }} title={v.update_summary}>
                        แก้ไขหลังอนุมัติ: {v.update_summary.split('\n').slice(0, 2).join(' | ')}{v.update_summary.split('\n').length > 2 ? ` และอีก ${v.update_summary.split('\n').length - 2} รายการ` : ''}
                      </div>
                    )}
                  </td>
                  <td>{v.time_from} - {v.time_to}</td>
                  <td>{v.purpose}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => viewRequest(v.id)}>ดู</button>{' '}
                    {v.status === 'pending' && v.can_act && (
                      <>
                        <button className="btn btn-success btn-sm" onClick={() => decide(v.id, 'approve')}>อนุมัติ</button>{' '}
                        <button className="btn btn-danger btn-sm" onClick={() => decide(v.id, 'reject')}>ไม่อนุมัติ</button>{' '}
                        <button className="btn btn-outline btn-sm" onClick={() => requestRevision(v.id)}>ส่งกลับแก้ไข</button>
                      </>
                    )}
                    {v.status === 'pending' && !v.can_act && (
                      <>
                        <span className="muted" style={{ fontSize: 12.5 }}>รอ {v.waiting_for || 'ผู้อนุมัติ'} อนุมัติ</span>{' '}
                        {v.can_resync && <button className="btn btn-outline btn-sm" onClick={() => resync(v.id)}>รีเซ็ตสายอนุมัติ</button>}
                      </>
                    )}
                  </td>
                </tr>
              )) : <tr><td colSpan={7} className="empty">ไม่มีรายการในหมวดนี้</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {modalData && (() => {
        const request = modalData.request;
        const closeModal = () => setModalData(null);
        // คำขอที่ถูกแก้ไขหลังอนุมัติแล้วส่งกลับมาให้อนุมัติอีกครั้ง: โชว์สิ่งที่เปลี่ยน
        let editedNotice = null;
        if (request.status === 'pending') {
          const list = modalData.history || [];
          const idx = list.reduce((m, h, i) => (h.action && h.action.startsWith('แก้ไขหลังอนุมัติ') ? i : m), -1);
          const reopenedAfter = idx >= 0 && list.slice(idx + 1).some(x => x.action && (x.action.startsWith('ส่งคำขอ') || x.action.startsWith('แก้ไขหลังอนุมัติ')));
          if (idx >= 0 && !reopenedAfter) {
            const h = list[idx];
            editedNotice = (
              <div style={{ margin: '0', padding: '10px 20px', background: '#eef3ff', borderBottom: '1px solid #c9d6ff', fontSize: 13 }}>
                <b>คำขอนี้ถูกแก้ไขหลังอนุมัติ — กรุณาตรวจสอบและอนุมัติอีกครั้ง</b>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>แก้ไขโดย {h.actor_name || 'ผู้ขอ'} · {fmtDateTime(h.created_at)}</div>
                <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{h.note || '-'}</div>
              </div>
            );
          }
        }
        const notInChain = request.status === 'pending' && !modalData.can_act;
        const banner = (editedNotice || notInChain) ? (
          <>
            {editedNotice}
            {notInChain && (
              <div style={{ padding: '10px 20px', background: '#fff7e6', borderBottom: '1px solid #f5d9a0', fontSize: 13, color: '#8a5a00' }}>
                คุณไม่ได้อยู่ในลำดับผู้อนุมัติของคำขอนี้ในขั้นตอนปัจจุบัน จึงอนุมัติไม่ได้ (ดูรายละเอียดได้อย่างเดียว)
                {modalData.can_resync && (
                  <div style={{ marginTop: 6 }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { resync(request.id); closeModal(); }}>รีเซ็ตสายอนุมัติตามรายชื่อล่าสุด</button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null;
        const footer = (request.status === 'pending' && modalData.can_act) ? (
          <div className="form-actions" style={{ justifyContent: 'flex-start', margin: 0, padding: '12px 20px', borderTop: '1px solid #e2e7f3', background: '#fff' }}>
            <button type="button" className="btn btn-success" onClick={() => { decide(request.id, 'approve'); closeModal(); }}>อนุมัติ</button>
            <button type="button" className="btn btn-danger" onClick={() => { decide(request.id, 'reject'); closeModal(); }}>ไม่อนุมัติ</button>
            <button type="button" className="btn btn-outline" onClick={() => { requestRevision(request.id); closeModal(); }}>ส่งกลับแก้ไข</button>
          </div>
        ) : null;
        return (
          <ReportDetailModal key={request.id} type="visit" id={request.id} hideBanner onClose={closeModal} banner={banner} footer={footer} />
        );
      })()}
    </Layout>
  );
}
