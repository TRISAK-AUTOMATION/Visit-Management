// client/src/pages/AdminEmailSettings.jsx - Admin: ตั้งค่าอีเมลแจ้งอนุมัติ
// 1) เปิด/ปิดแสดงเลขที่เอกสาร (#VR-code)
// 2) เปิด/ปิด "แสดงใน Email" ของ Field พื้นฐาน (ลูกค้า/วันที่/เวลา/วัตถุประสงค์)
// Field เดิมของระบบ + Field ที่สร้างเอง ให้ไปติ๊กที่หน้า Form Builder แทน (มีคอลัมน์ "แสดงใน Email" ในตารางอยู่แล้ว)
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import PageHero from '../components/PageHero';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';

export default function AdminEmailSettings() {
  const toast = useToast();
  const [showDocCode, setShowDocCode] = useState(true);
  const [essentialFields, setEssentialFields] = useState([]);
  const [savingDocCode, setSavingDocCode] = useState(false);
  const [savingField, setSavingField] = useState({});

  const load = async () => {
    const data = await api.get('/api/email-settings');
    setShowDocCode(data.show_doc_code);
    setEssentialFields(data.essential_fields);
  };

  useEffect(() => { load().catch(err => toast(err.message, 'error')); }, []);

  const toggleDocCode = async (checked) => {
    setShowDocCode(checked);
    setSavingDocCode(true);
    try {
      await api.put('/api/email-settings/doc-code', { show_doc_code: checked });
      toast('บันทึกสำเร็จ', 'success');
    } catch (err) { toast(err.message, 'error'); load(); }
    finally { setSavingDocCode(false); }
  };

  const toggleEssential = async (field_key, checked) => {
    setEssentialFields(list => list.map(f => f.field_key === field_key ? { ...f, show_in_email: checked } : f));
    setSavingField(s => ({ ...s, [field_key]: true }));
    try {
      await api.put(`/api/email-settings/essential/${field_key}`, { show_in_email: checked });
    } catch (err) { toast(err.message, 'error'); load(); }
    finally { setSavingField(s => ({ ...s, [field_key]: false })); }
  };

  return (
    <Layout title="ตั้งค่าอีเมล">
      <PageHero icon="mail" tone="blue" title="ตั้งค่าอีเมล"
        desc="กำหนดว่าอีเมลแจ้งเตือนผู้อนุมัติ (ตอนมีคำขอออกนอกสถานที่ใหม่รออนุมัติ) จะแสดงข้อมูลอะไรบ้าง" />

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 400 }}>
            <input type="checkbox" checked={showDocCode} disabled={savingDocCode}
              onChange={e => toggleDocCode(e.target.checked)} style={{ width: 'auto' }} />
            แสดงเลขที่เอกสาร (เช่น #VR-2026-00017) ในหัวเรื่องและเนื้อหาอีเมล
          </label>
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 4px' }}>Field พื้นฐาน</h3>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 12 }}>
          Field ที่จำเป็นต่อระบบ (ลูกค้า/วันที่/เวลา/วัตถุประสงค์) เลือกได้ว่าจะให้แสดงในอีเมลด้วยหรือไม่
        </p>
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Label</th><th>แสดงใน Email</th></tr>
            </thead>
            <tbody>
              {essentialFields.map(f => (
                <tr key={f.field_key}>
                  <td>{f.label}</td>
                  <td>
                    <input type="checkbox" checked={f.show_in_email} disabled={savingField[f.field_key]}
                      onChange={e => toggleEssential(f.field_key, e.target.checked)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12.5, marginTop: 16 }}>
        ต้องการเพิ่ม/แก้ไข Field อื่นๆ ที่จะแสดงในอีเมล (Field เดิมของระบบ หรือ Field ที่สร้างเอง)
        ไปที่หน้า <Link to="/admin-form-builder">จัดการแบบฟอร์ม Visit</Link> — แต่ละ Field มีคอลัมน์ "แสดงใน Email" ให้ติ๊กเลือกได้
      </p>
    </Layout>
  );
}
