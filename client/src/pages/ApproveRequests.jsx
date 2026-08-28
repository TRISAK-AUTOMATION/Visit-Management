// client/src/pages/ApproveRequests.jsx - เทียบเท่า public/approve-requests.html
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import RequestModal from '../components/RequestModal';
import { api, fmtDate } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const TABS = [
  { f: 'pending', label: 'รออนุมัติ' },
  { f: 'approved', label: 'อนุมัติแล้ว' },
  { f: 'rejected', label: 'ไม่อนุมัติ' }
];

export default function ApproveRequests() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [modalData, setModalData] = useState(null);

  const load = async (f = filter) => {
    const { requests } = await api.get(`/api/visit-requests?scope=pending&status=${f}`);
    setRows(requests);
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

  return (
    <Layout title="Approve Requests">
      <div className="tabs">
        {TABS.map(t => (
          <div key={t.f} className={`tab ${filter === t.f ? 'active' : ''}`} onClick={() => setFilter(t.f)}>{t.label}</div>
        ))}
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>วันที่ยื่น</th><th>ผู้ขอ</th><th>ลูกค้า / บริษัท</th><th>เวลา</th><th>วัตถุประสงค์</th><th>จัดการ</th></tr>
            </thead>
            <tbody>
              {rows.length ? rows.map(v => (
                <tr key={v.id}>
                  <td>{fmtDate(v.visit_date)}</td>
                  <td>{v.requester_name}</td>
                  <td>{v.customer_name}</td>
                  <td>{v.time_from} - {v.time_to}</td>
                  <td>{v.purpose}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => viewRequest(v.id)}>ดู</button>{' '}
                    {v.status === 'pending' && (
                      <>
                        <button className="btn btn-success btn-sm" onClick={() => decide(v.id, 'approve')}>อนุมัติ</button>{' '}
                        <button className="btn btn-danger btn-sm" onClick={() => decide(v.id, 'reject')}>ไม่อนุมัติ</button>{' '}
                        <button className="btn btn-outline btn-sm" onClick={() => requestRevision(v.id)}>ส่งกลับแก้ไข</button>
                      </>
                    )}
                  </td>
                </tr>
              )) : <tr><td colSpan={6} className="empty">ไม่มีรายการในหมวดนี้</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {modalData && (
        <RequestModal
          request={modalData.request}
          history={modalData.history}
          customFields={modalData.customFields}
          mode="approve"
          onClose={() => setModalData(null)}
          onDecide={decide}
          onRequestRevision={requestRevision}
        />
      )}
    </Layout>
  );
}
