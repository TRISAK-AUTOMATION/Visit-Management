// client/src/pages/MyTeam.jsx - รายชื่อทีมที่ฉันดู/ประเมินได้ (หัวหน้า/Admin)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { api, initials } from '../lib/api';

export default function MyTeam() {
  const [team, setTeam] = useState(null);

  useEffect(() => {
    api.get('/api/kpi/team/mine').then(({ team }) => setTeam(team)).catch(() => setTeam([]));
  }, []);

  return (
    <Layout title="ทีมของฉัน (My Team)">
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {team === null ? (
            <div className="muted" style={{ padding: 20 }}>กำลังโหลด...</div>
          ) : team.length ? (
            <table>
              <thead><tr><th></th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>แผนก</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
              <tbody>
                {team.map(u => (
                  <tr key={u.id}>
                    <td style={{ width: 46 }}>
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div className="pill-avatar" style={{ width: 32, height: 32, fontSize: 11 }}>{initials(u.full_name)}</div>
                      )}
                    </td>
                    <td>{u.full_name}</td>
                    <td>{u.position || '-'}</td>
                    <td>{u.department || '-'}</td>
                    <td><span className={`badge ${u.is_active ? 'approved' : 'cancelled'}`}>{u.is_active ? 'ใช้งานอยู่' : 'ถูกระงับ'}</span></td>
                    <td><Link className="btn btn-outline btn-sm" to={`/team/${u.id}`}>ดู/ประเมิน</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">ยังไม่มีคนในทีมของคุณ (ต้องอยู่แผนกเดียวกัน หรือได้รับสิทธิ์จาก Admin)</div>
          )}
        </div>
      </div>
    </Layout>
  );
}
