// client/src/pages/Notifications.jsx - เทียบเท่า public/notifications.html
import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { usePageContent } from '../lib/PageContentContext';
import { api, fmtDateTime } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { useAuth } from '../lib/AuthContext';

const ICONS = { new_request: '\uD83D\uDCDD', approved: '\u2705', rejected: '\u274C', reminder: '\uD83D\uDD14' };

export default function Notifications() {
  const { pc } = usePageContent();
  const toast = useToast();
  const { refreshBadges } = useAuth();
  const [items, setItems] = useState([]);

  const load = async () => {
    const { notifications } = await api.get('/api/notifications');
    setItems(notifications);
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id) => {
    await api.post(`/api/notifications/${id}/read`);
    load();
    refreshBadges();
  };

  const markAll = async () => {
    await api.post('/api/notifications/read-all');
    load();
    refreshBadges();
    toast('ทำเครื่องหมายว่าอ่านแล้วทั้งหมด', 'success');
  };

  return (
    <Layout title={pc('notifications.title', 'Notifications')}>
      <div className="flex between mb-16">
        <div className="tabs">
          <div className="tab active">ทั้งหมด</div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={markAll}>ทำเครื่องหมายว่าอ่านแล้วทั้งหมด</button>
      </div>
      <div className="card">
        <div className="card-body">
          {items.length ? items.map(n => (
            <div key={n.id} className="flex gap-12" style={{ padding: '12px 4px', borderBottom: '1px solid var(--border)', opacity: n.is_read ? 0.6 : 1 }} onClick={() => markRead(n.id)}>
              <div className="pill-avatar" dangerouslySetInnerHTML={{ __html: ICONS[n.type] || '\uD83D\uDD14' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{n.message}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{fmtDateTime(n.created_at)}</div>
              </div>
              {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue-600)', marginTop: 6 }} />}
            </div>
          )) : <div className="empty">ไม่มีการแจ้งเตือน</div>}
        </div>
      </div>
    </Layout>
  );
}
