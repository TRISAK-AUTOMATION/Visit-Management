// client/src/pages/AdminPdfSettings.jsx - Admin: ออกแบบหน้าตาเอกสาร PDF (สี/โลโก้/หัวเอกสาร/ลำดับหมวด)
import React, { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const emptySettings = {
  primary_color: '#0b1530', accent_color: '#2f5bff', logo_base64: '',
  org_name: 'TRISAK', org_subtitle: 'VISIT MANAGEMENT SYSTEM',
  doc_title: 'ใบขออนุมัติออกนอกสถานที่ (Visit Request Form)',
  show_signature: true, section_order: ['requester', 'customer', 'work', 'approval'],
  section_visible: { requester: true, customer: true, work: true, approval: true }
};

export default function AdminPdfSettings() {
  const toast = useToast();
  const fileRef = useRef(null);
  const [settings, setSettings] = useState(emptySettings);
  const [labels, setLabels] = useState({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { settings: s, section_labels } = await api.get('/api/pdf-settings');
    setSettings(s);
    setLabels(section_labels);
  };

  useEffect(() => { load().catch(err => toast(err.message, 'error')); }, []);

  const set = (key) => (e) => setSettings(s => ({ ...s, [key]: e.target.value }));

  const onLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast('ไฟล์โลโก้ใหญ่เกินไป (ไม่เกิน 2MB)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSettings(s => ({ ...s, logo_base64: reader.result }));
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setSettings(s => ({ ...s, logo_base64: '' }));
    if (fileRef.current) fileRef.current.value = '';
  };

  const moveSection = (key, dir) => {
    setSettings(s => {
      const order = [...s.section_order];
      const idx = order.indexOf(key);
      const swapWith = idx + dir;
      if (swapWith < 0 || swapWith >= order.length) return s;
      [order[idx], order[swapWith]] = [order[swapWith], order[idx]];
      return { ...s, section_order: order };
    });
  };

  const toggleSection = (key, checked) => {
    setSettings(s => ({ ...s, section_visible: { ...s.section_visible, [key]: checked } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const { settings: s } = await api.put('/api/pdf-settings', settings);
      setSettings(s);
      toast('บันทึกการตั้งค่า PDF สำเร็จ', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9 };

  return (
    <Layout title="ออกแบบ PDF">
      <p className="muted" style={{ marginBottom: 16 }}>
        ปรับหน้าตาเอกสาร PDF (ใบขออนุมัติ/รายงานการปฏิบัติงาน) ที่พิมพ์จากระบบ — สี, โลโก้, ข้อความหัวเอกสาร,
        และเลือกได้ว่าจะให้พิมพ์หมวดไหนบ้างและเรียงลำดับอย่างไร
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head"><h3>สี</h3></div>
        <div className="card-body">
          <div className="form-grid">
            <div className="form-group">
              <label>สีหลัก (แถบหัวเอกสาร)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={settings.primary_color} onChange={set('primary_color')} style={{ width: 44, height: 38, padding: 2, border: '1px solid var(--border)', borderRadius: 8 }} />
                <input type="text" value={settings.primary_color} onChange={set('primary_color')} style={inputStyle} />
              </div>
            </div>
            <div className="form-group">
              <label>สีเน้น (แถบบางใต้หัวเอกสาร)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={settings.accent_color} onChange={set('accent_color')} style={{ width: 44, height: 38, padding: 2, border: '1px solid var(--border)', borderRadius: 8 }} />
                <input type="text" value={settings.accent_color} onChange={set('accent_color')} style={inputStyle} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head"><h3>โลโก้</h3></div>
        <div className="card-body">
          {settings.logo_base64 && (
            <div style={{ marginBottom: 12 }}>
              <img src={settings.logo_base64} alt="โลโก้" style={{ height: 60, border: '1px solid var(--border)', borderRadius: 8, padding: 4 }} />
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onLogoChange} />
          {settings.logo_base64 && (
            <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: 10 }} onClick={removeLogo}>ลบโลโก้</button>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>ไฟล์ PNG/JPG/SVG ไม่เกิน 2MB — ถ้าไม่อัปโหลด จะแสดงชื่อองค์กรเป็นตัวหนังสือแทน</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head"><h3>ข้อความหัวเอกสาร</h3></div>
        <div className="card-body">
          <div className="form-grid">
            <div className="form-group">
              <label>ชื่อองค์กร</label>
              <input type="text" value={settings.org_name} onChange={set('org_name')} style={inputStyle} />
            </div>
            <div className="form-group">
              <label>คำอธิบายใต้ชื่อองค์กร</label>
              <input type="text" value={settings.org_subtitle} onChange={set('org_subtitle')} style={inputStyle} />
            </div>
            <div className="form-group full">
              <label>ชื่อเอกสาร</label>
              <input type="text" value={settings.doc_title} onChange={set('doc_title')} style={inputStyle} />
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head"><h3>หมวดข้อมูลในเอกสาร</h3></div>
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>หมวด</th><th>แสดง</th><th>ลำดับ</th></tr></thead>
            <tbody>
              {settings.section_order.map((key, idx) => (
                <tr key={key}>
                  <td>{labels[key] || key}</td>
                  <td>
                    <input type="checkbox" checked={settings.section_visible[key] !== false}
                      onChange={e => toggleSection(key, e.target.checked)} />
                  </td>
                  <td>
                    <button type="button" className="btn btn-outline btn-sm" disabled={idx === 0} onClick={() => moveSection(key, -1)}>&uarr;</button>{' '}
                    <button type="button" className="btn btn-outline btn-sm" disabled={idx === settings.section_order.length - 1} onClick={() => moveSection(key, 1)}>&darr;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 400 }}>
            <input type="checkbox" checked={settings.show_signature}
              onChange={e => setSettings(s => ({ ...s, show_signature: e.target.checked }))} style={{ width: 'auto' }} />
            แสดงบล็อกลายเซ็น (ผู้ขอปฏิบัติงาน / ผู้ตรวจสอบ / ผู้อนุมัติ) ท้ายเอกสาร
          </label>
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>บันทึก</button>
      </div>
    </Layout>
  );
}
