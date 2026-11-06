// VisitDetailView.jsx - แสดงฟอร์ม Visit Request แบบอ่านอย่างเดียว (ใช้ใน popup ของ Visit Report)
import React, { useRef, useState } from 'react';
import { fmtDate, fmtDateTime } from '../../lib/api';
import { WorkflowTimeline } from '../RequestModal';

const SECS = [
  { id: 's1', no: 1, title: 'Request Detail', th: 'รายละเอียดการเข้าพบลูกค้า', nav: 'Request Detail' },
  { id: 's2', no: 2, title: 'Visit Objective', th: 'วัตถุประสงค์การเข้าพบ', nav: 'Objective' },
  { id: 's3', no: 3, title: 'During Visit', th: 'ข้อมูลที่พบระหว่างการเข้าพบ', nav: 'During Visit' },
  { id: 's4', no: 4, title: 'Opportunity Summary', th: 'สรุปโอกาสทางธุรกิจ', nav: 'Opportunity' },
  { id: 's5', no: 5, title: 'Action Plan', th: 'แผนดำเนินงาน', nav: 'Action Plan' },
  { id: 's6', no: 6, title: 'Customer Level', th: 'ระดับลูกค้า', nav: 'Customer Level' },
  { id: 's7', no: 7, title: 'Next Visit', th: 'การเข้าพบครั้งถัดไป', nav: 'Next Visit' },
  { id: 's8', no: 8, title: 'Remark', th: 'หมายเหตุ', nav: 'Remark' },
  { id: 's9', no: 9, title: 'Customer Signature', th: 'ลายเซ็นลูกค้า', nav: 'ลายเซ็นลูกค้า' },
  { id: 'sw', no: '✓', title: 'Approval', th: 'ขั้นตอนการอนุมัติ', nav: 'การอนุมัติ' },
  { id: 'sh', no: '★', title: 'ประวัติการดำเนินการ', th: '', nav: 'ประวัติ' }
];
const arr = (v) => (Array.isArray(v) ? v : []);
const txt = (v) => (v === null || v === undefined ? '' : String(v));
const D = (v) => (v ? fmtDate(v) : '');
// ค่าของช่อง custom (Form Builder) ตามชนิดช่อง
const cfValue = (f) => {
  const v = f.value;
  if (v === null || v === undefined || v === '') return '';
  if (f.field_type === 'multiselect') { try { return JSON.parse(v).join(', '); } catch (e) { return v; } }
  if (f.field_type === 'checkbox') return v === 'true' ? 'ใช่' : 'ไม่ใช่';
  if (f.field_type === 'date') return fmtDate(v);
  if (f.field_type === 'datetime') return fmtDateTime(v);
  if (f.field_type === 'file') return <a href={v} download>ดาวน์โหลดไฟล์แนบ</a>;
  return v;
};

const F = ({ label, value, wide }) => (
  <div className={`vd-f${wide ? ' wide' : ''}`}><label>{label}</label><div>{React.isValidElement(value) ? value : txt(value)}</div></div>
);
const Chips = ({ items, other }) => {
  const base = arr(items).map((x) => (x === 'Other' && other ? `Other: ${other}` : x));
  const list = other && !arr(items).includes('Other') ? [...base, `Other: ${other}`] : base;
  return <div className="vd-chips">{list.map((x, i) => <span className="vd-chip" key={i}>{x}</span>)}</div>;
};
const Sub = ({ title, children }) => <div className="vd-sub"><h5>{title}</h5>{children}</div>;
const Card = ({ s, id, children }) => (
  <section className="vd-card" id={`vd-${id}`}>
    <header><b className="vd-no">{s.no}</b><h3>{s.title}</h3>{s.th && <span>{s.th}</span>}</header>
    <div className="vd-cbody">{children}</div>
  </section>
);

export default function VisitDetailView({ data }) {
  const v = data.visit; const i = v.info;
  const [active, setActive] = useState('s1');
  const bodyRef = useRef(null);
  const go = (id) => {
    setActive(id);
    const el = bodyRef.current && bodyRef.current.querySelector(`#vd-${id}`);
    if (el) bodyRef.current.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
  };
  const onScroll = () => {
    const b = bodyRef.current; if (!b) return;
    let cur = 's1';
    SECS.forEach(s => { const el = b.querySelector(`#vd-${s.id}`); if (el && el.offsetTop - 40 <= b.scrollTop) cur = s.id; });
    if (cur !== active) setActive(cur);
  };
  const d = v.during || {}; const pr = d.problems || {}; const pj = d.projects || {}; const po = d.potential || {}; const rc = d.recurring || {};
  const rows = arr((v.plan || {}).rows);
  // การ์ดการอนุมัติ: ความคิดเห็นผู้อนุมัติ/สิ่งที่ต้องแก้ไข + หมายเหตุตอนแจ้งเสร็จสิ้น + ขั้นตอนใน workflow (แสดงเมื่อมีข้อมูล)
  const fieldVal = (label) => { const f = (data.fields || []).find(x => x.label === label); return f ? f.value : ''; };
  const approvalNote = fieldVal('Approval Note'), completionNote = fieldVal('Completion Note');
  const approverName = fieldVal('Approver'), approvedAt = fieldVal('Approved At');
  const showSw = !!(approvalNote || completionNote || approverName || (data.workflow && data.workflow.states && data.workflow.states.length));
  const navSecs = SECS.filter(s => s.id !== 'sw' || showSw);
  return (
    <div className="vd-wrap">
      <nav className="vd-nav">
        {navSecs.map(s => (
          <button type="button" key={s.id} className={active === s.id ? 'on' : ''} onClick={() => go(s.id)}><b>{s.no}</b>{s.nav}</button>
        ))}
      </nav>
      <div className="vd-body" ref={bodyRef} onScroll={onScroll}>
        <Card s={SECS[0]} id="s1">
          <div className="vd-grid">
            <F label="Employee" value={i.employee} /><F label="Department" value={i.dept} /><F label="Sales Person" value={i.sales_person} />
            <F label="Company / Customer" value={i.customer_name || i.company} wide />
            <F label="Customer Code" value={i.customer_code} /><F label="Company" value={i.company} />
            <F label="Customer Type" value={({ new: 'New Customer', current: 'Current Customer' })[i.customer_type] || i.customer_type} />
            <F label="Customer Address" value={i.customer_address} wide />
            <F label="Request Date" value={D(i.request_date)} /><F label="Visit Date" value={D(i.visit_date)} />
            <F label="Time Out" value={i.time_from} /><F label="Time In" value={i.time_to} />
            <F label="Job Type" value={i.job_type} /><F label="Location" value={i.location} /><F label="Product" value={i.product} />
            <F label="Purpose" value={i.purpose} wide />
            <F label="Meeting Start" value={i.meeting_start} /><F label="Meeting End" value={i.meeting_end} />
            <F label="Transport" value={i.transport} /><F label="License Plate" value={i.license_plate} />
            <F label="Mileage Out" value={i.mileage_out} /><F label="Mileage In" value={i.mileage_in} />
            <F label="Actual Time Out" value={i.actual_time_out} /><F label="Actual Time Back" value={i.actual_time_back} /><F label="OT Hours" value={i.ot_hours} />
            <F label="Accompanied By" value={i.participants} wide />
            <F label="Customer Tax ID" value={i.customer_tax_id} /><F label="Tax Invoice Date" value={D(i.tax_invoice_date)} />
            {arr(data.custom_fields).map((f) => <F key={f.field_key} label={f.label} value={cfValue(f)} wide={f.field_type === 'textarea'} />)}
          </div>
          <Sub title="Contact Information">
            <table className="vd-tbl"><thead><tr><th>Name</th><th>Position</th><th>Telephone</th><th>Mobile</th><th>Email</th></tr></thead>
              <tbody>{arr(v.contacts).map((c, k) => (
                <tr key={k}><td>{c.name}</td><td>{c.position}</td><td>{txt(c.telephone)}{c.ext ? ` ต่อ ${c.ext}` : ''}</td><td>{c.mobile}</td><td>{c.email}</td></tr>
              ))}</tbody></table>
          </Sub>
        </Card>
        <Card s={SECS[1]} id="s2"><Chips items={(v.objective || {}).items} other={(v.objective || {}).other} /></Card>
        <Card s={SECS[2]} id="s3">
          <Sub title="3.1 Current Products / Brands"><Chips items={d.brands} />{d.brand_notes && <p className="vd-p">{d.brand_notes}</p>}</Sub>
          <Sub title="3.2 Recurring Part Demand"><div className="vd-grid"><F label="Demand" value={({ yes: 'Yes', no: 'No', need_info: 'Need More Information' })[rc.value] || rc.value} /><F label="Detail" value={rc.detail} wide /></div></Sub>
          <Sub title="3.3 Customer Problem / Improvement"><Chips items={pr.items} other={pr.other} />{pr.detail && <p className="vd-p">{pr.detail}</p>}</Sub>
          <Sub title="3.4 Upcoming Project / Future Plan"><Chips items={pj.items} other={pj.other} />
            <div className="vd-grid"><F label="Timing" value={pj.timing} /><F label="Detail" value={pj.detail} wide /></div></Sub>
          <Sub title="3.5 Potential Product Opportunity"><Chips items={po.items} other={po.other} />
            <div className="vd-grid"><F label="Product Application" value={po.product_application} /><F label="Current Brand" value={po.current_brand} /><F label="Target Brand" value={po.target_brand} /></div></Sub>
        </Card>
        <Card s={SECS[3]} id="s4">
          <Sub title="What did we find?"><Chips items={(v.opportunity || {}).found} /></Sub>
          <div className="vd-grid"><F label="Opportunity Level" value={(v.opportunity || {}).level} /><F label="Description" value={(v.opportunity || {}).description} wide /></div>
        </Card>
        <Card s={SECS[4]} id="s5">
          <Chips items={(v.plan || {}).actions} />
          <table className="vd-tbl"><thead><tr><th>#</th><th>Next Action</th><th>Owner</th><th>Customer Contact</th><th>Due</th><th>Expected Result</th></tr></thead>
            <tbody>{rows.map((r, k) => (
              <tr key={k}><td>{k + 1}</td><td>{r.next_action}</td><td>{r.owner_name}</td><td>{r.contact}</td><td>{D(r.due_date)}</td><td>{r.expected_result}</td></tr>
            ))}</tbody></table>
        </Card>
        <Card s={SECS[5]} id="s6"><div className="vd-grid"><F label="Level" value={(v.level || {}).level} /><F label="Reason" value={(v.level || {}).reason} wide /></div></Card>
        <Card s={SECS[6]} id="s7">
          <div className="vd-grid"><F label="Next Visit Needed" value={({ yes: 'Yes', no: 'No' })[(v.next || {}).needed] || (v.next || {}).needed} /><F label="Date" value={D((v.next || {}).date)} />
            <F label="Purpose" value={(v.next || {}).purpose} wide /><F label="Expected Outcome" value={(v.next || {}).expected_outcome} wide /></div>
        </Card>
        <Card s={SECS[7]} id="s8"><p className="vd-p">{i.notes}</p></Card>
        <Card s={SECS[8]} id="s9">
          {data.customer_signature ? (
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ border: '1px solid #e2e7f3', borderRadius: 12, background: '#fff', padding: 8, minWidth: 200 }}>
                <img src={data.customer_signature.data_url} alt="ลายเซ็นลูกค้า" style={{ display: 'block', maxWidth: 260, maxHeight: 120 }} />
              </div>
              <div className="vd-grid" style={{ flex: 1, minWidth: 220 }}>
                <F label="ผู้เซ็น" value={data.customer_signature.signer_name} />
                <F label="ตำแหน่ง" value={data.customer_signature.signer_title} />
                <F label="เซ็นเมื่อ" value={fmtDateTime(data.customer_signature.signed_at)} />
              </div>
            </div>
          ) : <p className="muted" style={{ margin: 0 }}>ยังไม่มีลายเซ็นลูกค้า</p>}
        </Card>
        {showSw && (
          <Card s={SECS[9]} id="sw">
            {approvalNote && (
              <div style={{ background: data.status === 'revision' ? '#fff3e6' : '#f3f6ff', border: '1px solid #e2e7f3', borderRadius: 10, padding: '8px 12px', marginBottom: 10, fontSize: 13 }}>
                <b>{data.status === 'revision' ? 'สิ่งที่ต้องแก้ไข' : 'ความคิดเห็นผู้อนุมัติ'}:</b> {approvalNote}
              </div>
            )}
            {approverName && <p className="vd-p"><b>ผู้อนุมัติ:</b> {approverName}{approvedAt ? ` · อนุมัติเมื่อ ${fmtDateTime(approvedAt)}` : ''}</p>}
            {completionNote && <p className="vd-p"><b>สรุปผลการเข้าพบ:</b> {completionNote}</p>}
            <WorkflowTimeline workflow={data.workflow} />
          </Card>
        )}
        <Card s={SECS[10]} id="sh">
          {data.history.length ? (
            <ol className="rx-timeline">
              {data.history.map((h, k) => (
                <li key={k} style={{ '--i': k }}><b>{h.action}</b><span className="muted"> · {h.actor || 'ระบบ'} · {fmtDateTime(h.created_at)}</span>
                  {h.note && <div className="rx-note">{h.note}</div>}</li>
              ))}
            </ol>
          ) : <p className="muted" style={{ margin: 0 }}>ยังไม่มีประวัติการดำเนินการ</p>}
        </Card>
      </div>
    </div>
  );
}
