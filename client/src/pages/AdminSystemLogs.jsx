// client/src/pages/AdminSystemLogs.jsx - หน้าดู audit trail (System Logs) สำหรับ Admin
import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../lib/api';

const ACTION_TH = {
  login: 'เข้าสู่ระบบ',
  logout: 'ออกจากระบบ',
  create_draft: 'บันทึกฉบับร่าง',
  submit_request: 'ส่งคำขอ',
  edit_request: 'แก้ไขคำขอ',
  cancel_request: 'ยกเลิกคำขอ',
  request_revision: 'ส่งกลับแก้ไข',
  approve_request: 'อนุมัติคำขอ',
  reject_request: 'ไม่อนุมัติคำขอ',
  create_user: 'สร้างผู้ใช้',
  update_user: 'แก้ไขผู้ใช้',
  delete_user: 'ลบผู้ใช้',
  enable_user: 'เปิดใช้งานบัญชี',
  disable_user: 'ระงับการใช้งานบัญชี'
};

export default function AdminSystemLogs() {
  const [logs, setLogs] = useState([]);
  const [actions, setActions] = useState([]);
  const [filter, setFilter] = useState('');

  const load = async (action = filter) => {
    const q = action ? `?action=${encodeURIComponent(action)}` : '';
    const r = await api.get(`/api/system-logs${q}`);
    setLogs(r.logs);
    setActions(r.actions);
  };

  useEffect(() => { load(); }, []);

  const onFilterChange = (e) => {
    const v = e.target.value;
    setFilter(v);
    load(v);
  };

  return (
    <Layout title="System Logs">
      <div className="flex between mb-16">
        <h3 style={{ margin: 0 }}>บันทึกการใช้งานระบบ (Audit Trail)</h3>
        <select value={filter} onChange={onFilterChange} style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)' }}>
          <option value="">ทุกประเภทการกระทำ</option>
          {actions.map(a => <option key={a} value={a}>{ACTION_TH[a] || a}</option>)}
        </select>
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>เวลา</th><th>ผู้ใช้งาน</th><th>การกระทำ</th><th>รายละเอียด</th></tr>
            </thead>
            <tbody>
              {logs.length ? logs.map(l => (
                <tr key={l.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{l.created_at}</td>
                  <td>{l.actor_name || 'ระบบ'} {l.actor_username ? <span className="muted">({l.actor_username})</span> : ''}</td>
                  <td>{ACTION_TH[l.action] || l.action}</td>
                  <td>{l.details}</td>
                </tr>
              )) : <tr><td colSpan={4} className="empty">ไม่มีบันทึกในหมวดนี้</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
