// client/src/pages/MyRequests.jsx - เทียบเท่า public/my-requests.html
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { usePageContent } from '../lib/PageContentContext';
import RequestModal from '../components/RequestModal';
import { api, fmtDate, statusLabel } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const TABS = [
  { f: 'all', label: 'ทั้งหมด' },
  { f: 'draft', label: 'ฉบับร่าง' },
  { f: 'pending', label: 'รออนุมัติ' },
  { f: 'revision', label: 'รอแก้ไข' },
  { f: 'approved', label: 'อนุมัติแล้ว' },
  { f: 'rejected', label: 'ไม่อนุมัติ' }
];

export default function MyRequests() {
  const { pc } = usePageContent();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [all, setAll] = useState([]);
  const [filter, setFilter] = useState('all');
  const [modalData, setModalData] = useState(null); // { request, history }

  const load = async () => {
    const { requests } = await api.get('/api/visit-requests?scope=mine');
    setAll(requests);
  };

  useEffect(() => { load(); }, []);

  // รองรับลิงก์เข้ามาจากอีเมล เช่น /my-requests?id=12 ให้เปิด modal อัตโนมัติ
  useEffect(() => {
    const id = searchParams.get('id');
    if (id) viewRequest(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const rows = filter === 'all' ? all : all.filter(r => r.status === filter);

  const cancelRequest = async (id, isDraft) => {
    if (!confirm(isDraft ? 'ยืนยันลบฉบับร่างนี้หรือไม่?' : 'ยืนยันยกเลิกคำขอนี้หรือไม่?')) return;
    try {
      await api.post(`/api/visit-requests/${id}/cancel`);
      toast(isDraft ? 'ลบฉบับร่างสำเร็จ' : 'ยกเลิกคำขอสำเร็จ', 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const submitRequest = async (id) => {
    try {
      await api.post(`/api/visit-requests/${id}/submit`);
      toast('ส่งคำขอสำเร็จ', 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const viewRequest = async (id) => {
    const data = await api.get(`/api/visit-requests/${id}`);
    setModalData(data);
  };

  return (
    <Layout title={pc('my_requests.title', 'My Requests')}>
      <div className="flex between mb-16">
        <div className="tabs">
          {TABS.map(t => (
            <div key={t.f} className={`tab ${filter === t.f ? 'active' : ''}`} onClick={() => setFilter(t.f)}>{t.label}</div>
          ))}
        </div>
        <Link className="btn btn-primary" to="/visit-request">+ สร้างคำขอ</Link>
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>วันที่</th><th>ลูกค้า / บริษัท</th><th>เวลา</th><th>วัตถุประสงค์</th><th>สถานะ</th><th>จัดการ</th></tr>
            </thead>
            <tbody>
              {rows.length ? rows.map(v => (
                <tr key={v.id}>
                  <td>{fmtDate(v.visit_date)}</td>
                  <td>{v.customer_name || '-'}</td>
                  <td>{v.time_from} - {v.time_to}</td>
                  <td>{v.purpose || '-'}</td>
                  <td><span className={`badge ${v.status}`}>{statusLabel(v.status)}</span></td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => viewRequest(v.id)}>ดูรายละเอียด</button>{' '}
                    {['draft', 'revision'].includes(v.status) && (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => navigate(`/visit-request?id=${v.id}`)}>แก้ไข</button>{' '}
                        <button className="btn btn-success btn-sm" onClick={() => submitRequest(v.id)}>ส่งคำขอ</button>{' '}
                      </>
                    )}
                    {v.status !== 'draft' && v.status !== 'revision' && (
                      <a className="btn btn-outline btn-sm" href={`/api/visit-requests/${v.id}/pdf`} target="_blank" rel="noreferrer" title="พิมพ์ PDF">&#128196;</a>
                    )}{' '}
                    {v.status === 'approved' && (
                      <button className="btn btn-outline btn-sm" onClick={() => navigate(`/visit-request?id=${v.id}`)}>
                        อัปเดตข้อมูลหลังปฏิบัติงาน
                      </button>
                    )}{' '}
                    {['pending', 'draft', 'revision'].includes(v.status) && (
                      <button className="btn btn-danger btn-sm" onClick={() => cancelRequest(v.id, v.status === 'draft')}>
                        {v.status === 'draft' ? 'ลบ' : 'ยกเลิก'}
                      </button>
                    )}
                  </td>
                </tr>
              )) : <tr><td colSpan={6} className="empty">ไม่มีคำขอในหมวดนี้</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {modalData && (
        <RequestModal
          request={modalData.request}
          history={modalData.history}
          customFields={modalData.customFields}
          mode="mine"
          onClose={() => setModalData(null)}
        />
      )}
    </Layout>
  );
}
