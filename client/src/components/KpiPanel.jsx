// client/src/components/KpiPanel.jsx - แผงคะแนนประเมินผลงาน (KPI) ใช้ในหน้าโปรไฟล์และหน้าทีมของฉัน
import React, { useState, useEffect } from 'react';
import { api, initials, fmtDate } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const CATS = [
  { key: 'attendance', label: 'การมาทำงาน', icon: '\uD83D\uDCC5', color: '#2f5bff' },
  { key: 'performance', label: 'ผลงาน', icon: '\uD83D\uDCC8', color: '#1fae62' },
  { key: 'responsibility', label: 'ความรับผิดชอบ', icon: '\uD83D\uDEE1', color: '#7b3fe4' },
  { key: 'teamwork', label: 'การทำงานเป็นทีม', icon: '\uD83E\uDD1D', color: '#f5a524' },
  { key: 'discipline', label: 'ระเบียบวินัย', icon: '\u2705', color: '#0f9b8e' },
];

function scoreTag(score) {
  if (score >= 90) return { text: 'ยอดเยี่ยม', bg: '#dff7e9', fg: '#188a51' };
  if (score >= 80) return { text: 'ดีเยี่ยม', bg: '#e7edff', fg: '#2f5bff' };
  if (score >= 65) return { text: 'ดีมาก', bg: '#fff3da', fg: '#c9861a' };
  if (score > 0) return { text: 'ควรปรับปรุง', bg: '#fde3e1', fg: '#d93a30' };
  return { text: 'ยังไม่ประเมิน', bg: '#eef0f5', fg: '#79839a' };
}

function Stars({ score }) {
  const n = Math.round((score / 100) * 5);
  return <div className="kpi-stars">{'\u2605'.repeat(n)}{'\u2606'.repeat(5 - n)}</div>;
}

export default function KpiPanel({ userId, showHeader = false }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [leave, setLeave] = useState(null);
  const [activity, setActivity] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [newChecklist, setNewChecklist] = useState({});

  const load = async () => {
    const d = await api.get(`/api/kpi/${userId}`);
    setData(d);
    if (!form) setForm(d.kpi);
    api.get(`/api/leave-requests/summary/${userId}`).then(setLeave).catch(() => {});
    api.get(`/api/kpi/${userId}/activity`).then(r => setActivity(r.activity)).catch(() => {});
  };
  useEffect(() => { load(); }, [userId]);

  if (!data) return <div className="muted" style={{ padding: 20 }}>กำลังโหลดข้อมูล...</div>;

  const { kpi, checklist, auto_stats, can_edit, user } = data;

  const saveKpi = async () => {
    try {
      await api.put(`/api/kpi/${userId}`, form);
      toast('บันทึกคะแนนสำเร็จ', 'success');
      setEditing(false);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const toggleCheck = async (item) => {
    try {
      await api.put(`/api/kpi/checklist/${item.id}`, { is_checked: !item.is_checked });
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const addChecklist = async (category) => {
    const label = (newChecklist[category] || '').trim();
    if (!label) return;
    try {
      await api.post(`/api/kpi/${userId}/checklist`, { category, label });
      setNewChecklist(f => ({ ...f, [category]: '' }));
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const removeChecklist = async (id) => {
    try { await api.del(`/api/kpi/checklist/${id}`); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  const tag = scoreTag(kpi.overall_score);
  const workStatusColor = kpi.work_status === 'ปกติ' ? '#1fae62' : kpi.work_status === 'ดีเด่น' ? '#2f5bff' : '#f0483e';

  return (
    <div>
      {showHeader && user && (
        <div className="card mb-16">
          <div className="card-body flex" style={{ alignItems: 'center', gap: 16 }}>
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div className="pill-avatar" style={{ width: 64, height: 64, fontSize: 20 }}>{initials(user.full_name)}</div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{user.full_name}</div>
              <div className="muted">{user.department || '-'} · {user.position || '-'}</div>
            </div>
            <span className="kpi-tag" style={{ background: tag.bg, color: tag.fg }}>{kpi.work_status}</span>
          </div>
        </div>
      )}

      {/* ภาพรวม KPI */}
      <div className="card mb-16">
        <div className="card-head flex between">
          <h3>ภาพรวมการทำงาน (KPI)</h3>
          {can_edit && !editing && <button className="btn btn-outline btn-sm" onClick={() => { setForm(kpi); setEditing(true); }}>แก้ไขคะแนน</button>}
          {can_edit && editing && (
            <div>
              <button className="btn btn-outline btn-sm" onClick={() => setEditing(false)}>ยกเลิก</button>{' '}
              <button className="btn btn-primary btn-sm" onClick={saveKpi}>บันทึก</button>
            </div>
          )}
        </div>
        <div className="card-body">
          <div className="kpi-grid">
            {CATS.map(c => (
              <div key={c.key} className="kpi-card">
                <div className="kpi-icon" style={{ background: c.color }}>{c.icon}</div>
                <div className="kpi-title">{c.label}</div>
                {editing ? (
                  <input type="range" min="0" max="100" className="kpi-slider" value={form[`${c.key}_score`]}
                    onChange={e => setForm(f => ({ ...f, [`${c.key}_score`]: Number(e.target.value) }))} />
                ) : null}
                <div className="kpi-score">{editing ? form[`${c.key}_score`] : kpi[`${c.key}_score`]}<span className="kpi-max"> / 100</span></div>
                <Stars score={editing ? form[`${c.key}_score`] : kpi[`${c.key}_score`]} />
              </div>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>คะแนนเฉลี่ยรวม (จาก 100)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 8, background: '#eef0f5', borderRadius: 20, overflow: 'hidden' }}>
              <div style={{ width: `${kpi.overall_score}%`, height: '100%', background: tag.fg }} />
            </div>
            <b>{kpi.overall_score} / 100</b>
          </div>
        </div>
      </div>

      {/* สถานะการทำงาน */}
      <div className="card mb-16">
        <div className="card-head"><h3>สถานะการทำงาน</h3></div>
        <div className="card-body">
          <div className="status-pill" style={{ marginBottom: 12 }}>
            <span className="dot" style={{ background: workStatusColor }} />
            {editing ? (
              <select value={form.work_status} onChange={e => setForm(f => ({ ...f, work_status: e.target.value }))}>
                <option value="ปกติ">ปกติ</option>
                <option value="ดีเด่น">ดีเด่น</option>
                <option value="ต้องปรับปรุง">ต้องปรับปรุง</option>
              </select>
            ) : kpi.work_status}
          </div>
          <table style={{ fontSize: 13 }}>
            <tbody>
              <tr><td style={{ padding: '5px 0' }}>ลา (ปีนี้)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{auto_stats.leave_count} ครั้ง</td></tr>
              <tr>
                <td style={{ padding: '5px 0' }}>มาสาย</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {editing ? <input type="number" min="0" style={{ width: 70, textAlign: 'right' }} value={form.late_count} onChange={e => setForm(f => ({ ...f, late_count: e.target.value }))} /> : `${kpi.late_count} ครั้ง`}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0' }}>ขาดงาน</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {editing ? <input type="number" min="0" style={{ width: 70, textAlign: 'right' }} value={form.absent_count} onChange={e => setForm(f => ({ ...f, absent_count: e.target.value }))} /> : `${kpi.absent_count} ครั้ง`}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0' }}>งานค้าง</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {editing ? <input type="number" min="0" style={{ width: 70, textAlign: 'right' }} value={form.pending_tasks} onChange={e => setForm(f => ({ ...f, pending_tasks: e.target.value }))} /> : `${kpi.pending_tasks} งาน`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* รายละเอียด KPI รายด้าน + เช็คลิสต์ */}
      <div className="card mb-16">
        <div className="card-head"><h3>รายละเอียด KPI รายด้าน</h3></div>
        <div className="card-body">
          <div className="kpi-grid">
            {CATS.map(c => {
              const items = checklist.filter(i => i.category === c.key);
              return (
                <div key={c.key} className="kpi-card">
                  <div className="kpi-icon" style={{ background: c.color }}>{c.icon}</div>
                  <div className="kpi-title">{c.label}</div>
                  <div className="kpi-score">{kpi[`${c.key}_score`]}<span className="kpi-max"> / 100</span></div>
                  <Stars score={kpi[`${c.key}_score`]} />
                  <div className="kpi-checklist">
                    {items.length ? items.map(item => (
                      <div key={item.id} className={`kpi-checklist-item ${item.is_checked ? 'done' : ''}`}>
                        <input type="checkbox" checked={!!item.is_checked} onChange={() => toggleCheck(item)} />
                        <span style={{ flex: 1 }}>{item.label}</span>
                        {can_edit && <span style={{ cursor: 'pointer', color: '#d93a30' }} onClick={() => removeChecklist(item.id)}>×</span>}
                      </div>
                    )) : <div className="muted" style={{ fontSize: 11.5 }}>ยังไม่มีรายการประเมิน</div>}
                    {can_edit && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                        <input type="text" placeholder="เพิ่มหัวข้อประเมิน..." style={{ flex: 1, fontSize: 11.5, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6 }}
                          value={newChecklist[c.key] || ''} onChange={e => setNewChecklist(f => ({ ...f, [c.key]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') addChecklist(c.key); }} />
                        <button className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} onClick={() => addChecklist(c.key)}>+</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* สรุปวันลา */}
      {leave && (
        <div className="card mb-16">
          <div className="card-head"><h3>สรุปวันลา (ปีนี้)</h3></div>
          <div className="card-body">
            <div className="dept-grid">
              <div className="stat-card sm blue"><div className="label">ลาพักร้อนคงเหลือ</div><div className="value">{leave.vacation_remaining}<span className="unit">/ {leave.vacation_total} วัน</span></div></div>
              <div className="stat-card sm orange"><div className="label">ลากิจคงเหลือ</div><div className="value">{leave.personal_remaining}<span className="unit">/ {leave.personal_total} วัน</span></div></div>
              <div className="stat-card sm red"><div className="label">ลาป่วยคงเหลือ</div><div className="value">{leave.sick_remaining}<span className="unit">/ {leave.sick_total} วัน</span></div></div>
              <div className="stat-card sm teal"><div className="label">รวมวันลาสะสม</div><div className="value">{leave.total_days_used}<span className="unit">วัน</span></div></div>
              <div className="stat-card sm purple"><div className="label">รวมชั่วโมงลาสะสม</div><div className="value">{leave.total_hours_used}<span className="unit">ชม.</span></div></div>
              <div className="stat-card sm slate"><div className="label">ครั้งที่ลา (ปีนี้)</div><div className="value" style={{ fontSize: 15 }}>กิจ {leave.by_type['ลากิจ'].cnt} · ป่วย {leave.by_type['ลาป่วย'].cnt}</div></div>
            </div>
          </div>
        </div>
      )}

      {/* กิจกรรมล่าสุด */}
      <div className="card">
        <div className="card-head"><h3>กิจกรรมล่าสุด / ผลงาน</h3></div>
        <div className="card-body">
          {activity.length ? activity.map(a => (
            <div key={a.id} className="activity-item">
              <span className="activity-date">{fmtDate(a.created_at)}</span>
              <span style={{ flex: 1 }}>{a.details || a.action}</span>
            </div>
          )) : <div className="muted" style={{ fontSize: 12.5 }}>ยังไม่มีกิจกรรม</div>}
        </div>
      </div>
    </div>
  );
}
