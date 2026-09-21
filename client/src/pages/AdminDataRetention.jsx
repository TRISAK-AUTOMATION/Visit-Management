// client/src/pages/AdminDataRetention.jsx
import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api, fmtDateTime } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const UNIT_LABEL = { day: 'วัน', month: 'เดือน', year: 'ปี' };

export default function AdminDataRetention() {
  const toast = useToast();
  const [settings, setSettings] = useState([]);
  const [saving, setSaving] = useState({});
  const [runningNow, setRunningNow] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

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

  const deleteAllRequests = async () => {
    const ok = confirm(
      'ยืนยันลบ "คำขอ Visit ทั้งหมด" ในระบบทิ้งถาวร?\n\n' +
      'คำเตือน: การกระทำนี้ไม่สามารถย้อนกลับได้ จะลบคำขอทุกสถานะ (ฉบับร่าง/รออนุมัติ/อนุมัติแล้ว/ไม่อนุมัติ/ยกเลิก) ' +
      'พร้อมประวัติการอนุมัติและข้อมูลที่กรอกไว้ทั้งหมด เหมาะสำหรับล้างข้อมูลที่ทดสอบระบบไว้ก่อนเริ่มใช้งานจริงเท่านั้น'
    );
    if (!ok) return;
    setDeletingAll(true);
    try {
      const result = await api.del('/api/visit-requests/bulk/all');
      toast(`ลบคำขอ Visit ทั้งหมดสำเร็จ (${result.deleted} รายการ)`, 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setDeletingAll(false); }
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
                    {row.last_run_at ? <>{fmtDateTime(row.last_run_at)}<br />{row.last_run_summary}</> : 'ยังไม่เคยรัน'}
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

      <div className="card" style={{ marginTop: 24, borderColor: '#f0483e' }}>
        <div className="card-head"><h3 style={{ color: '#c0392b' }}>ล้างข้อมูลทดสอบ</h3></div>
        <div className="card-body">
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            ลบ "คำขอ Visit" ทั้งหมดในระบบทิ้งถาวรทันที (ทุกสถานะ) — ใช้สำหรับเคลียร์ข้อมูลที่ลองส่งทดสอบกันไว้ ก่อนเริ่มใช้งานจริง
            การลบนี้ไม่เกี่ยวกับกฎลบอัตโนมัติด้านบน และย้อนกลับไม่ได้
          </p>
          <button className="btn" style={{ background: '#f0483e', color: '#fff' }} disabled={deletingAll} onClick={deleteAllRequests}>
            {deletingAll ? 'กำลังลบ...' : 'ลบคำขอ Visit ทั้งหมด'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
