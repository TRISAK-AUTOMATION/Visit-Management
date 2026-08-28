// client/src/pages/Customers.jsx - เทียบเท่า public/customers.html
import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const emptyForm = { name: '', contact_person: '', phone: '', email: '', address: '' };

export default function Customers() {
  const toast = useToast();
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined = ปิด modal, null = เพิ่มใหม่, object = แก้ไข
  const [form, setForm] = useState(emptyForm);

  const load = async (query) => {
    const { customers } = await api.get('/api/customers' + (query ? `?q=${encodeURIComponent(query)}` : ''));
    setCustomers(customers);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const openForm = (c) => {
    setEditing(c || null);
    setForm(c ? { name: c.name, contact_person: c.contact_person || '', phone: c.phone || '', email: c.email || '', address: c.address || '' } : emptyForm);
  };

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) await api.put(`/api/customers/${editing.id}`, form);
      else await api.post('/api/customers', form);
      toast('บันทึกสำเร็จ', 'success');
      setEditing(undefined);
      load(q);
    } catch (err) { toast(err.message, 'error'); }
  };

  const remove = async (id) => {
    if (!confirm('ยืนยันลบลูกค้ารายนี้หรือไม่?')) return;
    try {
      await api.del(`/api/customers/${id}`);
      toast('ลบสำเร็จ', 'success');
      load(q);
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <Layout title="Customer">
      <div className="flex between mb-16">
        <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาลูกค้า..."
          style={{ width: 280, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9 }} />
        <button className="btn btn-primary" onClick={() => openForm(null)}>+ เพิ่มลูกค้า</button>
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>รหัสลูกค้า</th><th>ชื่อบริษัท</th><th>ผู้ติดต่อ</th><th>เบอร์โทร</th><th>จัดการ</th></tr></thead>
            <tbody>
              {customers.length ? customers.map(c => (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td>{c.name}</td>
                  <td>{c.contact_person || '-'}</td>
                  <td>{c.phone || '-'}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => openForm(c)}>แก้ไข</button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => remove(c.id)}>ลบ</button>
                  </td>
                </tr>
              )) : <tr><td colSpan={5} className="empty">ไม่พบข้อมูลลูกค้า</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setEditing(undefined); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>{editing ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าใหม่'}</h3>
              <button className="modal-close" onClick={() => setEditing(undefined)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSubmit}>
                <div className="form-group"><label>ชื่อบริษัท <span className="req">*</span></label><input value={form.name} onChange={set('name')} required /></div>
                <div className="form-group"><label>ผู้ติดต่อ</label><input value={form.contact_person} onChange={set('contact_person')} /></div>
                <div className="form-group"><label>เบอร์โทร</label><input value={form.phone} onChange={set('phone')} /></div>
                <div className="form-group"><label>อีเมล</label><input value={form.email} onChange={set('email')} /></div>
                <div className="form-group"><label>ที่อยู่</label><textarea value={form.address} onChange={set('address')} /></div>
                <div className="form-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setEditing(undefined)}>ยกเลิก</button>
                  <button type="submit" className="btn btn-primary">บันทึก</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
