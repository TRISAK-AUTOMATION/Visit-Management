// client/src/pages/TeamMemberProfile.jsx - ดู/ประเมิน KPI ของพนักงานคนอื่น
import React from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import KpiPanel from '../components/KpiPanel';

export default function TeamMemberProfile() {
  const { id } = useParams();
  return (
    <Layout title="โปรไฟล์พนักงาน">
      <KpiPanel userId={id} showHeader={true} />
    </Layout>
  );
}
