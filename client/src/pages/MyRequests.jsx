// client/src/pages/MyRequests.jsx - เทียบเท่า public/my-requests.html
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { usePageContent } from '../lib/PageContentContext';
import RequestModal from '../components/RequestModal';
import CustomerSignModal from '../components/CustomerSignModal';
import ReportDetailModal from '../components/report/ReportDetailModal';
import '../components/report/report-ui.css';
import { api, fmtDate, statusLabel } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { useAuth } from '../lib/AuthContext';

const TABS = [
  { f: 'all', label: 'ทั้งหมด' },
  { f: 'draft', label: 'ฉบับร่าง' },
  { f: 'pending', label: 'รออนุมัติ' },
  { f: 'revision', label: 'รอแก้ไข' },
  { f: 'approved', label: 'Approve@Visiting' },
  { f: 'completed', label: 'Visit Completed' },
  { f: 'rejected', label: 'ไม่อนุมัติ' }
];

// "ขั้นตอน" ของคำขอ = สถานะอนุมัติ + การที่ผู้ขอกดแจ้ง Visit Completed แล้วหรือยัง
// (approved + completed_at = เสร็จสิ้น ; สถานะอนุมัติในระบบยังเป็น approved เหมือนเดิม)
const stageOf = (v) => (v.status === 'approved' && v.completed_at ? 'completed' : v.status);
const STAGE_LABEL = { approved: 'Approve@Visiting', completed: 'Visit Completed' };
const stageLabel = (st) => STAGE_LABEL[st] || statusLabel(st);

// แถบขั้นตอนเล็กๆ ในแต่ละแถว: ร่าง -> รออนุมัติ -> อนุมัติ -> เสร็จสิ้น (ให้พนักงานเห็นว่าคำขอถึงขั้นไหนแล้ว)
// รอแก้ไข = ถูกส่งกลับมาที่ผู้ขอ (ค้างที่ขั้น "รออนุมัติ" สีส้ม), ไม่อนุมัติ = จบที่ขั้น "อนุมัติ" สีแดง
const STAGE_STEPS = [{ k: 'draft' }, { k: 'pending' }, { k: 'approved' }, { k: 'completed' }];
function StageTrack({ stage }) {
  const idx = { draft: 0, pending: 1, revision: 1, approved: 2, rejected: 2, completed: 3 }[stage];
  if (idx === undefined) return null; // cancelled ฯลฯ ไม่แสดงแถบ
  const tone = stage === 'rejected' ? '#dc2626' : stage === 'revision' ? '#d97706' : stage === 'completed' ? '#0d9488' : stage === 'approved' ? '#16a34a' : '#2563eb';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }} title={stageLabel(stage)} aria-label={`ขั้นตอน: ${stageLabel(stage)}`}>
      {STAGE_STEPS.map((st, i) => (
        <React.Fragment key={st.k}>
          {i > 0 && <span style={{ width: 14, height: 2, background: i <= idx ? tone : '#d1d5db', borderRadius: 2 }} />}
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: i <= idx ? tone : '#e5e7eb', boxShadow: i === idx ? `0 0 0 3px ${tone}33` : 'none' }} />
        </React.Fragment>
      ))}
    </div>
  );
}

export default function MyRequests() {
  const { pc } = usePageContent();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { refreshMyVisit } = useAuth();
  const [all, setAll] = useState([]);
  // ตัวกรองอ่านจาก URL (?status=) เป็นหลัก เพื่อให้เมนูซ้าย (ฉบับร่าง/รออนุมัติ/...) กับแท็บในหน้านี้ตรงกันเสมอ
  const paramStatus = searchParams.get('status');
  const filter = ['draft', 'pending', 'revision', 'approved', 'approved_all', 'completed', 'rejected'].includes(paramStatus) ? paramStatus : 'all';
  const setFilter = (f) => {
    const next = new URLSearchParams(searchParams);
    if (f === 'all') next.delete('status'); else next.set('status', f);
    next.delete('id');
    setSearchParams(next);
  };
  const [modalData, setModalData] = useState(null); // { request, history }
  const [detailId, setDetailId] = useState(null); // เปิดรายละเอียดแบบเดียวกับ Visit Report (ไม่ใช่ฉบับร่าง)
  const [detailKey, setDetailKey] = useState(0); // เปลี่ยนค่า = โหลดรายละเอียดใหม่ (หลังเซ็น/ลบลายเซ็น)
  const [signing, setSigning] = useState(null); // คำขอที่กำลังให้ลูกค้าเซ็น
  const [completing, setCompleting] = useState(null); // { id, code, note } — กล่องแจ้ง Visit Completed

  const load = async () => {
    const { requests } = await api.get('/api/visit-requests?scope=mine');
    setAll(requests);
    if (refreshMyVisit) refreshMyVisit(); // อัปเดตตัวเลขที่เมนูซ้ายหลังยกเลิก/ส่งคำขอ
  };

  // โหลดใหม่ทุกครั้งที่เปลี่ยนขั้นตอน (กดเมนูซ้าย/แท็บ) เพื่อให้เห็นคำขอที่เพิ่งเปลี่ยนสถานะ
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [paramStatus]);

  // รองรับลิงก์เข้ามาจากอีเมล เช่น /my-requests?id=12 ให้เปิด modal อัตโนมัติ
  useEffect(() => {
    const id = searchParams.get('id');
    if (id) viewRequest(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const rows = filter === 'all' ? all : filter === 'approved_all' ? all.filter(r => r.status === 'approved') : all.filter(r => stageOf(r) === filter);

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

  const confirmComplete = async () => {
    try {
      await api.post(`/api/visit-requests/${completing.id}/complete`, { note: completing.note });
      toast('แจ้ง Visit Completed แล้ว คำขอย้ายไปขั้น "Visit Completed"', 'success');
      setCompleting(null);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const viewRequest = async (id) => {
    const data = await api.get(`/api/visit-requests/${id}`);
    // ฉบับร่างยังไม่อยู่ในรายงาน -> ใช้ popup เดิม ; ใบที่ส่งแล้วใช้หน้าตาเดียวกับ Visit Report
    if (data.request.status === 'draft') setModalData(data);
    else setDetailId(id);
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
              <tr><th>เลขที่เอกสาร</th><th>วันที่</th><th>ลูกค้า / บริษัท</th><th>เวลา</th><th>วัตถุประสงค์</th><th>สถานะ</th><th>จัดการ</th></tr>
            </thead>
            <tbody>
              {rows.length ? rows.map(v => (
                <tr key={v.id}>
                  <td className="nowrap"><b>{v.code}</b></td>
                  <td>{fmtDate(v.visit_date)}</td>
                  <td>{v.customer_name || '-'}</td>
                  <td>{v.time_from} - {v.time_to}</td>
                  <td>{v.purpose || '-'}</td>
                  <td data-label="สถานะ">
                    {stageOf(v) === 'completed'
                      ? <span className="badge" style={{ background: '#d5f5f0', color: '#0f766e' }}>{stageLabel('completed')}</span>
                      : <span className={`badge ${v.status}`}>{stageLabel(v.status)}</span>}
                    <StageTrack stage={stageOf(v)} />
                  </td>
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
                    {v.status === 'approved' && !v.completed_at && (
                      <button className="btn btn-outline btn-sm" onClick={() => navigate(`/visit-request?id=${v.id}`)}>
                        อัปเดตข้อมูลหลังปฏิบัติงาน
                      </button>
                    )}{' '}
                    {v.status === 'approved' && (
                      <button className="btn btn-outline btn-sm" onClick={() => setSigning(v)}>✍ ลายเซ็นลูกค้า</button>
                    )}{' '}
                    {v.status === 'approved' && !v.completed_at && (
                      <button className="btn btn-success btn-sm" onClick={() => setCompleting({ id: v.id, code: v.code, note: '' })}>
                        ✓ แจ้ง Visit Completed
                      </button>
                    )}{' '}
                    {['pending', 'draft', 'revision'].includes(v.status) && (
                      <button className="btn btn-danger btn-sm" onClick={() => cancelRequest(v.id, v.status === 'draft')}>
                        {v.status === 'draft' ? 'ลบ' : 'ยกเลิก'}
                      </button>
                    )}
                  </td>
                </tr>
              )) : <tr><td colSpan={7} className="empty">ไม่มีคำขอในหมวดนี้</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {detailId && (
        <ReportDetailModal
          key={detailKey}
          type="visit"
          id={detailId}
          mine
          onClose={() => setDetailId(null)}
          actions={(d) => (
            <>
              {d.status === 'revision' && (
                <button type="button" className="rx-pdfbtn" onClick={() => navigate(`/visit-request?id=${d.id}`)}>&#9998; แก้ไขคำขอ</button>
              )}
              {(d.status === 'approved' || d.status === 'completed') && (
                <button type="button" className="rx-pdfbtn" onClick={() => setSigning({ id: d.id, code: d.code, customer_name: d.visit.info.customer_name, visit_date: d.visit.info.visit_date, completed_at: d.status === 'completed' ? 'x' : null })}>
                  &#9997; ลายเซ็นลูกค้า{d.customer_signature ? ' ✓' : ''}
                </button>
              )}
              {d.status === 'approved' && (
                <button type="button" className="rx-pdfbtn" onClick={() => navigate(`/visit-request?id=${d.id}`)}>&#9998; อัปเดตข้อมูลหลังปฏิบัติงาน</button>
              )}
            </>
          )}
        />
      )}
      {modalData && (
        <RequestModal
          request={modalData.request}
          history={modalData.history}
          customFields={modalData.customFields}
          workflow={modalData.workflow}
          mode="mine"
          onClose={() => setModalData(null)}
        />
      )}
      {signing && <CustomerSignModal request={signing} onClose={() => setSigning(null)} onChanged={() => setDetailKey(k => k + 1)} />}
    {completing && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setCompleting(null); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>แจ้ง Visit Completed #{completing.code}</h3>
              <button className="modal-close" onClick={() => setCompleting(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="muted" style={{ marginTop: 0 }}>ไปพบลูกค้าเรียบร้อยแล้ว? คำขอนี้จะย้ายไปขั้น "Visit Completed"</p>
              <p style={{ background: '#fff7e6', color: '#8a5a00', border: '1px solid #f5d9a0', borderRadius: 9, padding: '8px 12px', fontSize: 13 }}>⚠ เมื่อยืนยันแล้ว <b>จะย้อนกลับหรือแก้ไขข้อมูลไม่ได้อีก</b> รวมถึงลายเซ็นลูกค้า กรุณาตรวจสอบข้อมูลและให้ลูกค้าเซ็นให้เรียบร้อยก่อน</p>
              <label className="muted" style={{ fontSize: 12 }}>สรุปผลการเข้าพบ (ไม่บังคับ)</label>
              <textarea style={{ width: '100%', minHeight: 90, marginTop: 4 }} maxLength={1000} value={completing.note}
                onChange={(e) => setCompleting(c => ({ ...c, note: e.target.value }))} placeholder="เช่น ลูกค้าสนใจสินค้า ขอใบเสนอราคา..." />
              <div className="form-actions" style={{ marginTop: 12 }}>
                <button className="btn btn-outline" onClick={() => setCompleting(null)}>ยกเลิก</button>
                <button className="btn btn-success" onClick={confirmComplete}>ยืนยัน Visit Completed</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
