// client/src/pages/AdminLeaveBalances.jsx - Admin จัดการสิทธิ์วันลารายบุคคล
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const LEAVE_TYPES = [
  { key: 'ลาพักร้อน', col: 'vacation_total' },
  { key: 'ลากิจ', col: 'personal_total' },
  { key: 'ลาป่วย', col: 'sick_total' }
];
const todayBkk = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
// อายุงาน (เดือนเต็ม) — logic เดียวกับ utils/leaveEntitlement.js (ฝั่งเซิร์ฟเวอร์เป็นตัวตัดสินจริงตอนบันทึก)
const tenureMonths = (start) => {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start || ''); const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayBkk());
  if (!a || !b) return null;
  let m = (b[1] - a[1]) * 12 + (b[2] - a[2]); if (Number(b[3]) < Number(a[3])) m -= 1;
  return Math.max(0, m);
};
const tenureText = (m) => (m === null || m === undefined ? '-' : m < 1 ? 'ไม่ถึง 1 เดือน' : `${m >= 12 ? `${Math.floor(m / 12)} ปี ` : ''}${m % 12 ? `${m % 12} เดือน` : ''}`.trim());
// ตัวคูณสัดส่วนปีแรก — เหมือน utils/leaveEntitlement.js (เฉพาะรอบปฏิทิน + เริ่มงานในปีนี้)
const prorateFactor = (start, settings) => {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start || ''); const t = todayBkk();
  if (!settings.prorate_first_year || settings.cycle !== 'calendar' || !a || a[1] !== t.slice(0, 4)) return 1;
  const day = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000;
  const y = Number(a[1]); const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return Math.min(1, Math.max(0, (day(y, 12, 31) - day(y, Number(a[2]), Number(a[3])) + 1) / (leap ? 366 : 365)));
};
const calcTotals = (rules, months, factor = 1) => {
  const out = {};
  LEAVE_TYPES.forEach(t => {
    let best = null;
    rules.forEach(r => { if (r.leave_type === t.key && r.min_months <= months && (!best || r.min_months >= best.min_months)) best = r; });
    const d = best ? best.days : 0;
    out[t.col] = factor >= 1 ? d : Math.round(d * factor * 2) / 2;
  });
  return out;
};
const fmtThai = (iso) => { if (!iso) return '-'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

export default function AdminLeaveBalances() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    vacation_total: 6, vacation_used: 0,
    personal_total: 3, personal_used: 0,
    sick_total: 30, sick_used: 0,
    note: ''
  });
  const [q, setQ] = useState('');
  const [rules, setRules] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [auto, setAuto] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [draftRules, setDraftRules] = useState([]);
  const [settings, setSettings] = useState({ cycle: 'calendar', prorate_first_year: false });
  const [draftSettings, setDraftSettings] = useState({ cycle: 'calendar', prorate_first_year: false });

  const load = async () => {
    const { balances, rules: rl, settings: st } = await api.get('/api/leave-requests/balances/all');
    setRows(balances);
    setRules(rl || []);
    if (st) setSettings(st);
  };
  useEffect(() => { load(); }, []);

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      vacation_total: row.balance.vacation_total, vacation_used: row.balance.vacation_used,
      personal_total: row.balance.personal_total, personal_used: row.balance.personal_used,
      sick_total: row.balance.sick_total, sick_used: row.balance.sick_used,
      note: row.balance.note || ''
    });
    setStartDate(row.start_date || '');
    setAuto(!!row.auto_entitlement);
  };

  // เปิดคำนวณอัตโนมัติ: ช่อง "สิทธิ์" แสดงค่าที่คำนวณจากอายุงานตามกติกา (แก้เองไม่ได้)
  const autoTotals = auto && startDate ? calcTotals(rules, tenureMonths(startDate) ?? 0, prorateFactor(startDate, settings)) : null;
  const shownTotal = (col) => (autoTotals ? autoTotals[col] : form[col]);

  // ----- กติกาสิทธิ์ตามอายุงาน -----
  const openRules = () => {
    setDraftRules(rules.map(r => {
      const yearly = r.min_months > 0 && r.min_months % 12 === 0;
      return { leave_type: r.leave_type, value: yearly ? r.min_months / 12 : r.min_months, unit: yearly ? 'year' : 'month', days: r.days };
    }));
    setDraftSettings(settings);
    setRulesOpen(true);
  };
  const updRule = (i, patch) => setDraftRules(list => list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRule = (type) => setDraftRules(list => [...list, { leave_type: type, value: 1, unit: 'year', days: 0 }]);
  const delRule = (i) => setDraftRules(list => list.filter((_, idx) => idx !== i));
  const saveRules = async () => {
    try {
      const payload = draftRules.map(r => ({ leave_type: r.leave_type, min_months: Math.round(Number(r.value) * (r.unit === 'year' ? 12 : 1)), days: Number(r.days) }));
      const { updated_users } = await api.put('/api/leave-requests/balances/rules', { rules: payload, cycle: draftSettings.cycle, prorate_first_year: draftSettings.prorate_first_year });
      toast(`บันทึกกติกาแล้ว${updated_users ? ` — ปรับสิทธิ์พนักงาน ${updated_users} คน` : ''}`, 'success');
      setRulesOpen(false);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const setNum = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/api/leave-requests/balances/${editing.id}`, { ...form, start_date: startDate, auto_entitlement: auto });
      toast('บันทึกสิทธิ์วันลาสำเร็จ', 'success');
      setEditing(null);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const filtered = rows.filter(r => !q.trim() || r.full_name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Layout title="จัดการสิทธิ์วันลา (Leave Balances)">
      <div className="flex between mb-16" style={{ flexWrap: 'wrap', gap: 10 }}>
        <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาพนักงาน..."
          style={{ width: 240, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9 }} />
        <button className="btn btn-primary btn-sm" onClick={openRules}>ตั้งเงื่อนไขสิทธิ์ตามอายุงาน</button>
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>ชื่อ-นามสกุล</th>
                <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>แผนก</th>
                <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>วันเริ่มงาน / อายุงาน</th>
                <th colSpan={3} style={{ textAlign: 'center' }}>ลาพักร้อน (วัน)</th>
                <th colSpan={3} style={{ textAlign: 'center' }}>ลากิจ (วัน)</th>
                <th colSpan={3} style={{ textAlign: 'center' }}>ลาป่วย (วัน)</th>
                <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>จัดการ</th>
              </tr>
              <tr>
                <th>สิทธิ์</th><th>ใช้ไป</th><th>คงเหลือ</th>
                <th>สิทธิ์</th><th>ใช้ไป</th><th>คงเหลือ</th>
                <th>สิทธิ์</th><th>ใช้ไป</th><th>คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td>{r.full_name}{r.auto_entitlement && <span className="badge approved" style={{ marginLeft: 6, fontSize: 10 }} title="คำนวณสิทธิ์อัตโนมัติตามอายุงาน">อัตโนมัติ</span>}</td>
                  <td>{r.department || '-'}</td>
                  <td>{r.start_date ? <>{fmtThai(r.start_date)}<br /><span className="muted" style={{ fontSize: 11.5 }}>{tenureText(r.tenure_months)}</span></> : <span className="muted">ยังไม่ระบุ</span>}</td>
                  <td>{r.balance.vacation_total}</td>
                  <td>{r.balance.vacation_used}</td>
                  <td>{Math.max(0, r.balance.vacation_total - r.balance.vacation_used)}</td>
                  <td>{r.balance.personal_total}</td>
                  <td>{r.balance.personal_used}</td>
                  <td>{Math.max(0, r.balance.personal_total - r.balance.personal_used)}</td>
                  <td>{r.balance.sick_total}</td>
                  <td>{r.balance.sick_used}</td>
                  <td>{Math.max(0, r.balance.sick_total - r.balance.sick_used)}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => openEdit(r)}>แก้ไขสิทธิ์</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="modal">
            <div className="modal-head"><h3>แก้ไขสิทธิ์วันลา - {editing.full_name}</h3><button className="modal-close" onClick={() => setEditing(null)}>×</button></div>
            <div className="modal-body">
              <form onSubmit={save}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>วันเริ่มทำงาน</label>
                    <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); if (!e.target.value) setAuto(false); }} />
                    {startDate && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>อายุงานตอนนี้: {tenureText(tenureMonths(startDate))}</div>}
                    {editing && editing.cycle && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>รอบสิทธิ์ปัจจุบัน: {fmtThai(editing.cycle.start)} - {fmtThai(editing.cycle.end)}</div>}
                  </div>
                  <div className="form-group" style={{ justifyContent: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                      <input type="checkbox" style={{ width: 'auto' }} checked={auto} disabled={!startDate} onChange={e => setAuto(e.target.checked)} />
                      คำนวณสิทธิ์อัตโนมัติตามอายุงาน
                    </label>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{startDate ? 'สิทธิ์ 3 ประเภทจะตามกติกา และเพิ่มเองเมื่อครบรอบ' : 'ใส่วันเริ่มทำงานก่อนจึงเปิดได้'}</div>
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>สิทธิ์ลาพักร้อนต่อปี (วัน)</label>
                    <input type="number" step="0.5" value={shownTotal('vacation_total')} onChange={setNum('vacation_total')} disabled={!!autoTotals} required />
                  </div>
                  <div className="form-group">
                    <label>ลาพักร้อนที่ใช้ไปแล้ว (วัน)</label>
                    <input type="number" step="0.5" value={form.vacation_used} onChange={setNum('vacation_used')} required />
                  </div>
                  <div className="form-group">
                    <label>สิทธิ์ลากิจต่อปี (วัน)</label>
                    <input type="number" step="0.5" value={shownTotal('personal_total')} onChange={setNum('personal_total')} disabled={!!autoTotals} required />
                  </div>
                  <div className="form-group">
                    <label>ลากิจที่ใช้ไปแล้ว (วัน)</label>
                    <input type="number" step="0.5" value={form.personal_used} onChange={setNum('personal_used')} required />
                  </div>
                  <div className="form-group">
                    <label>สิทธิ์ลาป่วยต่อปี (วัน)</label>
                    <input type="number" step="0.5" value={shownTotal('sick_total')} onChange={setNum('sick_total')} disabled={!!autoTotals} required />
                  </div>
                  <div className="form-group">
                    <label>ลาป่วยที่ใช้ไปแล้ว (วัน)</label>
                    <input type="number" step="0.5" value={form.sick_used} onChange={setNum('sick_used')} required />
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 11.5, margin: '2px 0 10px' }}>
                  ค่าเริ่มต้น: ลาพักร้อน 6 วัน, ลากิจ 3 วัน (ตามนโยบายบริษัท ไม่มีขั้นต่ำตามกฎหมาย), ลาป่วยแบบได้ค่าจ้าง 30 วัน (สูงสุดตามกฎหมายแรงงาน) — ปรับได้ตามจริงของแต่ละคน
                  ระบบจะหักยอด "ใช้ไป" ให้อัตโนมัติเมื่อคำขอลาประเภทนั้นถูกอนุมัติ ปรับเองที่นี่ได้ในกรณีพิเศษ เช่น ยกยอดจากระบบเก่า
                </div>
                <div className="form-group">
                  <label>หมายเหตุ</label>
                  <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="เช่น เริ่มงานกลางปี ปรับสิทธิ์ตามสัดส่วน" />
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>ยกเลิก</button>
                  <button type="submit" className="btn btn-primary">บันทึก</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {rulesOpen && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setRulesOpen(false); }}>
          <div className="modal" style={{ maxWidth: 720 }}>
            <div className="modal-head"><h3>เงื่อนไขสิทธิ์วันลาตามอายุงาน</h3><button className="modal-close" onClick={() => setRulesOpen(false)}>×</button></div>
            <div className="modal-body">
              <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
                ตั้งว่า "ครบอายุงานเท่าไหร่ ได้สิทธิ์กี่วันต่อปี" ระบบใช้เงื่อนไขที่อายุงานถึงและสูงสุดของแต่ละประเภท (ใส่ 0 = ตั้งแต่วันแรกที่เริ่มงาน) ถ้าอายุงานยังไม่ถึงเงื่อนไขใดเลย สิทธิ์ประเภทนั้นเป็น 0 วัน
                ใช้กับพนักงานที่ใส่วันเริ่มทำงานและติ๊ก "คำนวณสิทธิ์อัตโนมัติ" เท่านั้น — คนอื่นยังเป็นค่าที่กรอกเอง การบันทึกจะปรับสิทธิ์ของพนักงานกลุ่มนี้ทันที (ไม่แตะยอด "ใช้ไป")
              </div>
              <div style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 9 }}>
                <b>รอบสิทธิ์วันลา</b>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400, margin: '8px 0' }}>
                  <input type="radio" name="cycle" style={{ width: 'auto', marginTop: 3 }} checked={draftSettings.cycle === 'calendar'} onChange={() => setDraftSettings(d => ({ ...d, cycle: 'calendar' }))} />
                  <span>ตามปีปฏิทิน (1 ม.ค. - 31 ธ.ค.)</span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400, margin: '8px 0' }}>
                  <input type="radio" name="cycle" style={{ width: 'auto', marginTop: 3 }} checked={draftSettings.cycle === 'anniversary'} onChange={() => setDraftSettings(d => ({ ...d, cycle: 'anniversary' }))} />
                  <span>ตามวันครบรอบวันเริ่มงานของแต่ละคน (คนที่ยังไม่ใส่วันเริ่มงานใช้ปีปฏิทิน)</span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400, margin: '8px 0 0', opacity: draftSettings.cycle === 'calendar' ? 1 : 0.5 }}>
                  <input type="checkbox" style={{ width: 'auto', marginTop: 3 }} disabled={draftSettings.cycle !== 'calendar'} checked={draftSettings.prorate_first_year} onChange={e => setDraftSettings(d => ({ ...d, prorate_first_year: e.target.checked }))} />
                  <span>คิดสิทธิ์ตามสัดส่วนในปีที่เริ่มงาน (เฉพาะรอบปีปฏิทิน เช่น เริ่มกลางปีได้สิทธิ์ลากิจประมาณครึ่งหนึ่ง ปัดเป็น 0.5 วัน)</span>
                </label>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                  เมื่อขึ้นรอบใหม่ ระบบรีเซ็ตยอด "ใช้ไป" ทุกประเภทเป็น 0 ให้เองและเก็บยอดรอบก่อนไว้ในประวัติ (ไม่ยกยอดข้ามรอบ) การเปลี่ยนชนิดรอบที่นี่จะไม่ล้างยอด "ใช้ไป" ของรอบปัจจุบัน
                </div>
              </div>
              {LEAVE_TYPES.map(t => (
                <div key={t.key} style={{ marginBottom: 16 }}>
                  <b>{t.key}</b>
                  {draftRules.map((r, i) => r.leave_type !== t.key ? null : (
                    <div key={i} className="flex gap-12" style={{ alignItems: 'center', margin: '8px 0', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                      <span>ครบ</span>
                      <input type="number" min="0" step="1" value={r.value} onChange={e => updRule(i, { value: e.target.value })} style={{ width: 80 }} aria-label="อายุงาน" />
                      <select value={r.unit} onChange={e => updRule(i, { unit: e.target.value })} style={{ width: 90 }}>
                        <option value="year">ปี</option><option value="month">เดือน</option>
                      </select>
                      <span>ได้</span>
                      <input type="number" min="0" step="0.5" value={r.days} onChange={e => updRule(i, { days: e.target.value })} style={{ width: 80 }} aria-label="จำนวนวัน" />
                      <span>วัน / ปี</span>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => delRule(i)} aria-label="ลบเงื่อนไข">ลบ</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => addRule(t.key)}>+ เพิ่มเงื่อนไข</button>
                </div>
              ))}
              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => setRulesOpen(false)}>ยกเลิก</button>
                <button type="button" className="btn btn-primary" onClick={saveRules}>บันทึกเงื่อนไข</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
