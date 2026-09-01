// client/src/pages/AdminDataRetention.jsx
import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const UNIT_LABEL = { day: 'วัน', month: 'เดือน', year: 'ปี' };

export default function AdminDataRetention() {
  const toast = useToast();
  const [settings, setSettings] = useState([]);
  const [saving, setSaving] = useState({});
  const [runningNow, setRunningNow] = useState(false);

  const load = async () => {
    const { settings } = await api.get('/api/retention-settings');
    setSettings(settings);
  };

  useEffect(() => { load().catch(err => toast(err.message, 'error')); }, []);

  const updateLocal = (data_type, field, value) => {
    setSettings(list => list.map(s => s.data_type === data_type ? { ...s, [field]: value } : s));
  };

  const save = async (row) => {
    setSaving(s => ({ ...s, [row.data_type]: true }));
    try {
      await api.put(`/api/retention-settings/${row.data_type}`, {
        enabled: !!row.enabled,
        retain_value: Number(row.retain_value),
        retain_unit: row.retain_unit
      });
      toast(`บันทึกกฎ "${row.label}" สำเร็จ`, 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(s => ({ ...s, [row.data_type]: false })); }
  };

  const runNow = async () => {
    if (!confirm('ยืนยันรันการลบข้อมูลอัตโนมัติทันทีตามกฎที่ "เปิดใช้งาน" อยู่ตอนนี้?\n\nการลบไม่สามารถย้อนกลับได้')) return;
    setRunningNow(true);
    try {
      const { results } = await api.post('/api/retention-settings/run-now');
      const lines = Object.entries(results).map(([k, v]) => `${k}: ลบ ${v.deleted} รายการ`);
      toast(lines.length ? `รันสำเร็จ — ${lines.join(', ')}` : 'ไม่มีกฎที่เปิดใช้งานอยู่', 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
    finally { setRunningNow(false); }
  };

  return (
    <Layout title="ตั้งค่าการลบข้อมูลอัตโนมัติ (Data Retention)">
      <p className="muted" style={{ marginBottom: 16 }}>
        กำหนดได้ว่าข้อมูลแต่ละประเภทจะถูก "เก็บไว้" นานเท่าไหร่ก่อนลบทิ้งอัตโนมัติ ระบบจะตรวจสอบและลบให้ทุกวัน
        (ข้อมูลที่ยังถูกอ้างอิงอยู่ เช่น ลูกค้าที่ยังมีคำขอ Visit ผูกอยู่ จะไม่ถูกลบแม้เกินกำหนดก็ตาม)
      </p>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>ประเภทข้อมูล</th><th>เปิดใช้งาน</th><th>เก็บไว้</th><th>รันล่าสุด</th><th></th></tr>
            </thead>
            <tbody>
              {settings.map(row => (
                <tr key={row.data_type}>
                  <td>{row.label}</td>
                  <td>
                    <input type="checkbox" checked={!!row.enabled}
                      onChange={e => updateLocal(row.data_type, 'enabled', e.target.checked)} />
                  </td>
                  <td>
                    <div className="flex" style={{ gap: 6 }}>
                      <input type="number" min="1" value={row.retain_value}
                        onChange={e => updateLocal(row.data_type, 'retain_value', e.target.value)}
                        style={{ width: 70, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8 }} />
                      <select value={row.retain_unit} onChange={e => updateLocal(row.data_type, 'retain_unit', e.target.value)}>
                        <option value="day">วัน</option>
                        <option value="month">เดือน</option>
                        <option value="year">ปี</option>
                      </select>
                    </div>
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>
                    {row.last_run_at ? <>{row.last_run_at}<br />{row.last_run_summary}</> : 'ยังไม่เคยรัน'}
                  </td>
                  <td>
                    <button className="btn btn-primary btn-sm" disabled={saving[row.data_type]} onClick={() => save(row)}>
                      {saving[row.data_type] ? 'กำลังบันทึก...' : 'บันทึก'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn btn-outline" disabled={runningNow} onClick={runNow}>
          {runningNow ? 'กำลังรัน...' : 'รันตามกฎที่เปิดใช้งานทันที'}
        </button>
      </div>
    </Layout>
  );
}
