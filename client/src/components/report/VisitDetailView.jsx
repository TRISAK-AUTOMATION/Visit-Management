// VisitDetailView.jsx - แสดงฟอร์ม Visit Request แบบอ่านอย่างเดียว (ใช้ใน popup ของ Visit Report)
import React, { useRef, useState } from 'react';
import { fmtDate, fmtDateTime } from '../../lib/api';

const SECS = [
  { id: 's1', no: 1, title: 'Request Detail', th: 'รายละเอียดการเข้าพบลูกค้า', nav: 'Request Detail' },
  { id: 's2', no: 2, title: 'Visit Objective', th: 'วัตถุประสงค์การเข้าพบ', nav: 'Objective' },
  { id: 's3', no: 3, title: 'During Visit', th: 'ข้อมูลที่พบระหว่างการเข้าพบ', nav: 'During Visit' },
  { id: 's4', no: 4, title: 'Opportunity Summary', th: 'สรุปโอกาสทางธุรกิจ', nav: 'Opportunity' },
  { id: 's5', no: 5, title: 'Action Plan', th: 'แผนดำเนินงาน', nav: 'Action Plan' },
  { id: 's6', no: 6, title: 'Customer Level', th: 'ระดับลูกค้า', nav: 'Customer Level' },
  { id: 's7', no: 7, title: 'Next Visit', th: 'การเข้าพบครั้งถัดไป', nav: 'Next Visit' },
  { id: 's8', no: 8, title: 'Remark', th: 'หมายเหตุ', nav: 'Remark' },
  { id: 'sh', no: '★', title: 'ประวัติการดำเนินการ', th: '', nav: 'ประวัติ' }
];
const arr = (v) => (Array.isArray(v) ? v : []);
const txt = (v) => (v === null || v === undefined ? '' : String(v));
const D = (v) => (v ? fmtDate(v) : '');

const F = ({ label, value, wide }) => (
  <div className={`vd-f${wide ? ' wide' : ''}`}><label>{label}</label><div>{txt(value)}</div></div>
);
const Chips = ({ items, other }) => {
  const list = [...arr(items), ...(other ? [`Other: ${other}`] : [])];
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
  return (
    <div className="vd-wrap">
      <nav className="vd-nav">
        {SECS.map(s => (
          <button type="button" key={s.id} className={active === s.id ? 'on' : ''} onClick={() => go(s.id)}><b>{s.no}</b>{s.nav}</button>
        ))}
      </nav>
      <div className="vd-body" ref={bodyRef} onScroll={onScroll}>
        <Card s={SECS[0]} id="s1">
          <div className="vd-grid">
            <F label="Employee" value={i.employee} /><F label="Department" value={i.dept} /><F label="Sales Person" value={i.sales_person} />
            <F label="Company / Customer" value={i.customer_name || i.company} wide />
            <F label="Request Date" value={D(i.request_date)} /><F label="Visit Date" value={D(i.visit_date)} />
            <F label="Time Out" value={i.time_from} /><F label="Time In" value={i.time_to} />
            <F label="Job Type" value={i.job_type} /><F label="Location" value={i.location} /><F label="Product" value={i.product} />
            <F label="Purpose" value={i.purpose} wide />
            <F label="Meeting Start" value={i.meeting_start} /><F label="Meeting End" value={i.meeting_end} />
            <F label="Transport" value={i.transport} /><F label="License Plate" value={i.license_plate} />
            <F label="Mileage Out" value={i.mileage_out} /><F label="Mileage In" value={i.mileage_in} />
            <F label="Actual Time Out" value={i.actual_time_out} /><F label="Actual Time Back" value={i.actual_time_back} /><F label="OT Hours" value={i.ot_hours} />
            <F label="Accompanied By" value={i.participants} wide />
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
          <Sub title="3.2 Recurring Part Demand"><div className="vd-grid"><F label="Demand" value={rc.value} /><F label="Detail" value={rc.detail} wide /></div></Sub>
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
        <Card s={SECS[8]} id="sh">
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
