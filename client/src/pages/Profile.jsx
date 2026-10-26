// หน้า Profile Dashboard — หน้าแรกหลัง login (ข้อมูลจาก GET /api/profile-dashboard ซึ่งอ้างอิง session ของตัวเอง)
import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../lib/AuthContext';
import { api, canAccessVisit } from '../lib/api';
import ProfileHeader from '../components/profile/ProfileHeader';
import EditProfileModal from '../components/profile/EditProfileModal';
import PasswordModal from '../components/profile/PasswordModal';
import UsageSummary from '../components/profile/UsageSummary';
import LeaveBalance from '../components/profile/LeaveBalance';
import KPIOverview from '../components/profile/KPIOverview';
import RecentRequests from '../components/profile/RecentRequests';
import QuickActions from '../components/profile/QuickActions';
import Modal from '../components/profile/Modal';
import KpiPanel from '../components/KpiPanel';
import '../components/profile/profile.css';

export default function Profile() {
  const { me, setMe } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'edit' | 'password' | 'kpi' | null — เปิดได้ทีละอัน

  const load = useCallback(() => {
    setError('');
    api.get('/api/profile-dashboard').then(setData).catch(e => setError(e.message || 'โหลดข้อมูลไม่สำเร็จ'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const user = { ...(data ? data.user : {}), ...me, departments: (me.departments && me.departments.length ? me.departments : (data && data.user.departments) || []) };
  const canVisit = canAccessVisit(me);

  return (
    <Layout title="โปรไฟล์ของฉัน">
      <div className="pd">
        <ProfileHeader user={user} kpi={data ? data.kpi : null} onOpenKpi={() => setModal('kpi')} onEdit={() => setModal('edit')} onPassword={() => setModal('password')} />
        {error && <div className="pd-card pd-error" role="alert">{error} <button type="button" className="btn btn-ghost btn-sm" onClick={load}>ลองใหม่</button></div>}
        {!data && !error && <div className="pd-card pd-empty" aria-busy="true">กำลังโหลดข้อมูล…</div>}
        {data && (
          <>
            <UsageSummary counts={data.counts} canVisit={canVisit} />
            <div className="pd-cols">
              <div className="pd-col">
                <LeaveBalance leave={data.leave} totals={data.leave_totals} startDate={data.user.start_date} />
                <RecentRequests rows={data.recent} />
              </div>
              <div className="pd-col">
                <QuickActions canVisit={canVisit} />
                <KPIOverview kpi={data.kpi} onOpen={() => setModal('kpi')} />
              </div>
            </div>
          </>
        )}
      </div>
      {modal === 'edit' && <EditProfileModal me={me} setMe={setMe} onClose={() => setModal(null)} onSaved={load} />}
      {modal === 'kpi' && <Modal title="รายละเอียด KPI" onClose={() => setModal(null)} width={900} labelId="pd-kpi-title"><KpiPanel userId={me.id} showHeader={false} /></Modal>}
      {modal === 'password' && <PasswordModal onClose={() => setModal(null)} />}
    </Layout>
  );
}
