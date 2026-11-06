// client/src/pages/AdminPdfSettings.jsx - Admin: ออกแบบหน้าตาเอกสาร PDF (สี/โลโก้/หัวเอกสาร/ลำดับหมวด)
import React, { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout';
import PageHero from '../components/PageHero';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const emptySettings = {
  primary_color: '#0b1530', accent_color: '#2f5bff', logo_base64: '',
  org_name: 'TRISAK', org_subtitle: 'VISIT MANAGEMENT SYSTEM', docs: {}
};
// ช่องที่แต่ละเอกสารปรับได้ + ส่วนที่ใช้ค่ากลาง (โลโก้/สี/ชื่อองค์กร)
const DOC_TABS = [
  { id: 'visit_form', fields: ['title', 'subtitle', 'footer'], uses: 'ใช้โลโก้กลาง (ถ้ามี) — สี/ชื่อองค์กรไม่ใช้ เพราะเป็นแบบฟอร์มขาว-ดำตามกระดาษ' },
  { id: 'visit_report', fields: ['title', 'subtitle', 'footer'], uses: 'ใช้โลโก้ สี และชื่อองค์กรกลางทั้งหมด' },
  { id: 'leave', fields: ['company', 'title'], uses: 'แบบฟอร์มตามกระดาษ — ปรับชื่อบริษัทและชื่อเอกสารได้' },
  { id: 'ot', fields: ['company', 'title'], uses: 'แบบฟอร์มตามกระดาษ — ปรับชื่อบริษัทและชื่อเอกสารได้' }
];
const FIELD_LABEL = { title: 'ชื่อเอกสาร (บรรทัดบน)', subtitle: 'ชื่อรอง (บรรทัดล่าง)', footer: 'ข้อความท้ายเอกสาร', company: 'ชื่อบริษัท (หัวเอกสาร)' };

export default function AdminPdfSettings() {
  const toast = useToast();
  const fileRef = useRef(null);
  const [settings, setSettings] = useState(emptySettings);
  const [defaults, setDefaults] = useState({});
  const [tab, setTab] = useState('global');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState({ url: undefined, nonce: 0 });

  const load = async () => {
    const r = await api.get('/api/pdf-settings');
    setSettings(r.settings);
    setDefaults(r.doc_defaults || {});
  };

  useEffect(() => { load().catch(err => toast(err.message, 'error')); }, []);

  // เปลี่ยนแท็บเอกสาร -> หา PDF ล่าสุดมาแสดงตัวอย่าง (เป็นค่าที่ "บันทึกแล้ว")
  const loadPreview = async (doc) => {
    setPreview({ url: undefined, nonce: Date.now() });
    try { const r = await api.get(`/api/pdf-settings/preview/${doc}`); setPreview({ url: r.url, nonce: Date.now() }); }
    catch (e) { setPreview({ url: null, nonce: Date.now() }); }
  };
  useEffect(() => { if (tab !== 'global') loadPreview(tab); }, [tab]);

  const set = (key) => (e) => setSettings(s => ({ ...s, [key]: e.target.value }));
  const setDoc = (doc, key, val) => setSettings(s => ({ ...s, docs: { ...s.docs, [doc]: { ...s.docs[doc], [key]: val } } }));

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

  const save = async () => {
    setSaving(true);
    try {
      const { settings: s } = await api.put('/api/pdf-settings', { ...settings, section_order: undefined, section_visible: undefined });
      setSettings(s);
      toast('บันทึกการตั้งค่า PDF สำเร็จ', 'success');
      if (tab !== 'global') loadPreview(tab);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9 };

  return (
    <Layout title="ออกแบบ PDF">
      <PageHero icon="palette" tone="purple" title="ออกแบบ PDF"
        desc="ระบบมีเอกสาร PDF 4 แบบ แยกตั้งค่าได้ทีละแบบ ส่วนโลโก้/สี/ชื่อองค์กรเป็นค่ากลางที่ใช้ร่วมกัน (ดูว่าเอกสารไหนใช้อะไรในแต่ละแท็บ)" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button type="button" className={`btn btn-sm ${tab === 'global' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('global')}>ค่ากลาง (โลโก้/สี)</button>
        {DOC_TABS.map(t => (
          <button key={t.id} type="button" className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab(t.id)}>{(defaults[t.id] || {}).label || t.id}</button>
        ))}
      </div>

      {tab === 'global' && (<>
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
        <div className="card-head"><h3>ชื่อองค์กร (ใช้กับรายงาน Visit แบบละเอียด เมื่อไม่มีโลโก้)</h3></div>
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
          </div>
        </div>
      </div>
      </>)}

      {DOC_TABS.filter(t => t.id === tab).map(t => {
        const d = (settings.docs || {})[t.id] || {};
        const def = defaults[t.id] || {};
        return (
          <div key={t.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 420px) 1fr', gap: 16, alignItems: 'start' }}>
            <div className="card">
              <div className="card-head"><h3>{def.label}</h3></div>
              <div className="card-body">
                <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>{t.uses}</p>
                {t.fields.map(f => (
                  <div className="form-group" key={f}>
                    <label>{FIELD_LABEL[f]}</label>
                    <input type="text" maxLength={120} value={d[f] ?? ''} placeholder={f === 'title' || f === 'company' ? (def[f] || '') : 'เว้นว่าง = ไม่แสดง'} onChange={(e) => setDoc(t.id, f, e.target.value)} style={inputStyle} />
                  </div>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 400, marginTop: 8 }}>
                  <input type="checkbox" checked={d.show_signature !== false} onChange={e => setDoc(t.id, 'show_signature', e.target.checked)} style={{ width: 'auto' }} />
                  แสดงช่องลายเซ็น
                </label>
                <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={() => setSettings(s => ({ ...s, docs: { ...s.docs, [t.id]: { ...def } } }))}>คืนค่าเริ่มต้นของเอกสารนี้</button>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>ตัวอย่าง (ใบล่าสุดในระบบ — เห็นผลหลังกดบันทึก)</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                {preview.url === undefined && <p className="muted" style={{ padding: 16 }}>กำลังโหลดตัวอย่าง...</p>}
                {preview.url === null && <p className="muted" style={{ padding: 16 }}>ยังไม่มีเอกสารตัวอย่างในระบบ (ต้องมีคำขอที่ส่งแล้ว{['leave', 'ot'].includes(t.id) ? 'และอนุมัติแล้ว' : ''} อย่างน้อย 1 ใบ)</p>}
                {preview.url && <iframe key={preview.nonce} title="ตัวอย่าง PDF" src={`${preview.url}#toolbar=0`} style={{ width: '100%', height: 620, border: 0 }} />}
              </div>
            </div>
          </div>
        );
      })}

      <div className="form-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>บันทึก</button>
      </div>
    </Layout>
  );
}
