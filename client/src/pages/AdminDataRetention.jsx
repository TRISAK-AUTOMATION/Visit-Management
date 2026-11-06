// client/src/pages/AdminDataRetention.jsx
import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import PageHero from '../components/PageHero';
import PopupModal from '../components/PopupModal';
import RIcon from '../components/report/ReportIcons';
import '../components/ui-kit.css';
import { api, fmtDateTime } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const UNIT_LABEL = { day: 'วัน', month: 'เดือน', year: 'ปี' };

export default function AdminDataRetention() {
  const toast = useToast();
  const [settings, setSettings] = useState([]);
  const [saving, setSaving] = useState({});
  const [runningNow, setRunningNow] = useState(false);
  const [td, setTd] = useState(null);        // สรุปข้อมูลทดสอบ { enabled, visit, leave, ot }
  const [target, setTarget] = useState(null); // 'visit' | 'leave' | 'ot' ที่กำลังขอยืนยันลบ
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { settings } = await api.get('/api/retention-settings');
    setSettings(settings);
  };

  const loadTd = async () => setTd(await api.get('/api/retention-settings/test-data'));
  useEffect(() => { load().catch(err => toast(err.message, 'error')); loadTd().catch(() => {}); }, []);

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

  const toggleTd = async () => {
    try {
      await api.put('/api/retention-settings/test-data/enabled', { enabled: !td.enabled });
      toast(td.enabled ? 'ปิดฟังก์ชันล้างข้อมูลทดสอบแล้ว' : 'เปิดฟังก์ชันล้างข้อมูลทดสอบแล้ว', 'success');
      loadTd();
    } catch (err) { toast(err.message, 'error'); }
  };

  const fd = (n) => String(Math.round(n * 100) / 100);
  const refund = td ? td.leave.refund : { vacation: 0, personal: 0, sick: 0 };
  const TARGETS = td ? {
    visit: { label: 'คำขอ Visit', icon: 'car', tone: 'blue', count: td.visit.total, unit: 'รายการ', url: '/api/visit-requests/bulk/all', method: 'del',
      desc: 'ทุกสถานะ พร้อมประวัติการอนุมัติและข้อมูลที่กรอกไว้' },
    leave: { label: 'ใบลา', icon: 'umbrella', tone: 'green', count: td.leave.total, unit: 'ใบ', url: '/api/retention-settings/test-data/leave', method: 'post',
      desc: td.leave.approved
        ? `ใบที่อนุมัติแล้ว ${td.leave.approved} ใบ จะคืนวันลาให้ — พักร้อน ${fd(refund.vacation)} · ลากิจ ${fd(refund.personal)} · ลาป่วย ${fd(refund.sick)} วัน`
        : 'ยังไม่มีใบลาที่อนุมัติ (ไม่ต้องคืนวันลา)' },
    ot: { label: 'คำขอ OT', icon: 'clock', tone: 'orange', count: td.ot.total, unit: 'ใบ', url: '/api/retention-settings/test-data/ot', method: 'post',
      desc: 'ทุกสถานะ พร้อมประวัติการอนุมัติ' }
  } : {};

  const closeConfirm = () => { setTarget(null); setTyped(''); };
  const doDelete = async () => {
    const t = TARGETS[target];
    setBusy(true);
    try {
      const r = await api[t.method](t.url);
      toast(`ลบ${t.label}ทั้งหมดสำเร็จ (${r.deleted} ${t.unit})${target === 'leave' && td.leave.approved ? ' และคืนวันลาให้แล้ว' : ''}`, 'success');
      closeConfirm();
      loadTd();
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Layout title="ตั้งค่าการลบข้อมูลอัตโนมัติ (Data Retention)">
      <PageHero icon="database" tone="red" title="ลบข้อมูลอัตโนมัติ"
        desc='กำหนดว่าข้อมูลแต่ละประเภทจะถูก "เก็บไว้" นานเท่าไหร่ก่อนลบทิ้งอัตโนมัติ ระบบตรวจสอบและลบให้ทุกวัน (ข้อมูลที่ยังถูกอ้างอิงอยู่ เช่น ลูกค้าที่ยังมีคำขอ Visit ผูกอยู่ จะไม่ถูกลบแม้เกินกำหนด)' />

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

      {td && (
        <section className={`ux-danger ux-rise ${td.enabled ? '' : 'locked'}`}>
          <div className="ux-danger-head">
            <span className="ux-danger-ico"><RIcon name="trash" size={20} /></span>
            <div className="grow">
              <h3>ล้างข้อมูลทดสอบ</h3>
              <p>ลบข้อมูลที่ลองส่งทดสอบระบบทิ้งถาวรทันที (ทุกสถานะ) ก่อนเริ่มใช้งานจริง — ไม่เกี่ยวกับกฎลบอัตโนมัติด้านบน และย้อนกลับไม่ได้</p>
            </div>
            <label className="ux-switch" title="เมื่อเริ่มใช้งานจริง แนะนำให้ปิดไว้ กันกดลบข้อมูลจริงโดยพลาด">
              <input type="checkbox" checked={td.enabled} onChange={toggleTd} />
              <span className="trk" />
              {td.enabled ? 'เปิดใช้งาน' : 'ปิดอยู่'}
            </label>
          </div>
          {!td.enabled && <div className="ux-callout" style={{ margin: '0 20px 14px' }}>🔒 ปิดฟังก์ชันนี้ไว้ — ปุ่มลบทั้งหมดถูกล็อก (เหมาะเมื่อเริ่มใช้งานจริงแล้ว) เปิดสวิตช์ด้านบนเมื่ออยากล้างข้อมูลทดสอบอีกครั้ง</div>}
          <div className="ux-danger-list">
            {Object.entries(TARGETS).map(([k, t], i) => (
              <div key={k} className={`ux-danger-row tone-${t.tone}`} style={{ '--i': i }}>
                <span className="ux-tico" style={{ width: 40, height: 40, borderRadius: 12 }}><RIcon name={t.icon} size={20} /></span>
                <div className="grow">
                  <b>{t.label}</b>
                  <small>{t.desc}</small>
                </div>
                <span className="ux-pill gray">{t.count} {t.unit}</span>
                <button type="button" className="ux-btn danger sm" disabled={!td.enabled || t.count === 0} onClick={() => { setTyped(''); setTarget(k); }}>
                  <RIcon name="trash" size={14} /> ลบทั้งหมด
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {target && TARGETS[target] && (
        <PopupModal title={`ลบ${TARGETS[target].label}ทั้งหมด`} subtitle={`${TARGETS[target].count} ${TARGETS[target].unit} · ย้อนกลับไม่ได้`} icon="warn" tone="red" width={560}
          onClose={closeConfirm}
          footer={<>
            <button type="button" className="ux-btn ghost" onClick={closeConfirm}>ยกเลิก</button>
            <button type="button" className="ux-btn danger" style={{ background: typed.trim() === 'ลบ' ? '#d93a30' : undefined, color: typed.trim() === 'ลบ' ? '#fff' : undefined }}
              disabled={typed.trim() !== 'ลบ' || busy} onClick={doDelete}><RIcon name="trash" size={15} /> {busy ? 'กำลังลบ...' : 'ยืนยันลบถาวร'}</button>
          </>}>
          <div className="ux-sec" style={{ '--i': 0 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.7 }}>
              จะลบ <b>{TARGETS[target].label}</b> ทุกสถานะในระบบ พร้อมประวัติการอนุมัติและการแจ้งเตือนที่เกี่ยวข้อง
              {target === 'leave' && <> และ <b>คืนวันลา</b>ที่ถูกหักไปจากใบที่อนุมัติแล้วให้พนักงานเท่าเดิม</>}
            </p>
            {target === 'leave' && <div className="ux-callout" style={{ marginBottom: 12 }}>{TARGETS.leave.desc}</div>}
            <label className="ux-label" htmlFor="confirm-del">พิมพ์คำว่า <b style={{ color: '#d93a30' }}>ลบ</b> เพื่อยืนยัน</label>
            <input id="confirm-del" className="ux-input" autoFocus value={typed} onChange={e => setTyped(e.target.value)} placeholder="ลบ"
              onKeyDown={e => { if (e.key === 'Enter' && typed.trim() === 'ลบ' && !busy) doDelete(); }} />
          </div>
        </PopupModal>
      )}
    </Layout>
  );
}
