// client/src/components/VisitExtraDetails.jsx
// แสดงข้อมูลชุดใหม่ของฟอร์ม Visit (ผู้ติดต่อ / Objective / During Visit / Opportunity / Action Plan / Customer Level / Next Visit)
// แบบอ่านอย่างเดียว ใช้ใน RequestModal (หน้าคำขอของฉัน / อนุมัติ / ปฏิทิน)
import React from 'react';
import { fmtDate } from '../lib/api';
import '../pages/visit-form.css';

const parse = (s, fb) => { try { const v = typeof s === 'string' ? JSON.parse(s) : s; return v === null || v === undefined ? fb : v; } catch (e) { return fb; } };
const OPP_COLOR = { High: '#e5483e', Medium: '#f5902a', Low: '#e3b11a', None: '#9aa2b4' };
const LEVEL_COLOR = {
  'No Change': '#9aa2b4', 'L1 Strategic': '#2f5bff', 'L2 Growth': '#1fae62', 'L3 Maintain': '#0ea5b7', 'L4 Develop': '#f5a524', 'L5 Low Priority': '#8b93a7'
};

function Tags({ items, other }) {
  const list = (items || []).map(i => (i === 'Other' && other ? `Other: ${other}` : i));
  if (!list.length) return null;
  return <div className="vf-detail-tags">{list.map(i => <span key={i}>{i}</span>)}</div>;
}
function Row({ label, children }) {
  if (children === undefined || children === null || children === '' || (Array.isArray(children) && !children.length)) return null;
  return <p><b>{label}:</b> {children}</p>;
}

// hasVisitExtras: คำขอเก่า (ก่อนมีฟอร์มใหม่) จะไม่มีข้อมูลชุดนี้เลย -> ไม่ต้องแสดงอะไร
export function hasVisitExtras(r) {
  return !!(r && (r.contacts_json || r.objective_json || r.during_visit_json || r.opportunity_json || r.action_plan_json
    || r.customer_level_json || r.next_visit_json || r.company || r.customer_type || r.meeting_start || r.meeting_end));
}

export default function VisitExtraDetails({ request: r }) {
  if (!hasVisitExtras(r)) return null;
  const contacts = (parse(r.contacts_json, []) || []).filter(c => c && c.name);
  const obj = parse(r.objective_json, null);
  const dv = parse(r.during_visit_json, null);
  const opp = parse(r.opportunity_json, null);
  const plan = parse(r.action_plan_json, null);
  const level = parse(r.customer_level_json, null);
  const next = parse(r.next_visit_json, null);
  const recurringLabel = { yes: 'Yes', no: 'No', need_info: 'Need More Information' };

  return (
    <div className="vf-detail">
      {(r.company || r.customer_type || r.request_date || r.meeting_start || r.meeting_end) && (
        <>
          <h4>Visit Information</h4>
          <Row label="Request Date">{r.request_date ? fmtDate(r.request_date) : ''}</Row>
          <Row label="Company">{r.company}</Row>
          <Row label="Customer Type">{r.customer_type === 'new' ? 'New Customer' : r.customer_type === 'current' ? 'Current Customer' : ''}</Row>
          <Row label="Meeting">{r.meeting_start || r.meeting_end ? `${r.meeting_start || '-'} - ${r.meeting_end || '-'}` : ''}</Row>
        </>
      )}

      {contacts.length > 0 && (
        <>
          <h4>Contacts</h4>
          {contacts.map((c, i) => (
            <div className="vf-detail-card" key={c.id || i}>
              <b>{c.name}</b>{c.position ? ` · ${c.position}` : ''}
              <div className="muted">
                {[c.telephone && `Tel ${c.telephone}`, c.mobile && `Mobile ${c.mobile}`, c.email].filter(Boolean).join(' · ')}
              </div>
            </div>
          ))}
        </>
      )}

      {obj && (obj.items || []).length > 0 && (
        <>
          <h4>Visit Objective</h4>
          <Tags items={obj.items} other={obj.other} />
        </>
      )}

      {dv && (
        <>
          {((dv.brands || []).length > 0 || dv.brand_notes) && (
            <><h4>Current Products / Brands</h4><Tags items={dv.brands} /><Row label="Notes">{dv.brand_notes}</Row></>
          )}
          {dv.recurring && dv.recurring.value && (
            <><h4>Recurring Part Demand</h4><Row label="Answer">{recurringLabel[dv.recurring.value] || dv.recurring.value}</Row><Row label="Product / Application">{dv.recurring.detail}</Row></>
          )}
          {dv.problems && ((dv.problems.items || []).length > 0 || dv.problems.detail) && (
            <><h4>Customer Problem / Improvement</h4><Tags items={dv.problems.items} other={dv.problems.other} /><Row label="Detail">{dv.problems.detail}</Row></>
          )}
          {dv.projects && ((dv.projects.items || []).length > 0 || dv.projects.detail || dv.projects.timing) && (
            <><h4>Upcoming Project / Future Plan</h4><Tags items={dv.projects.items} other={dv.projects.other} /><Row label="Detail">{dv.projects.detail}</Row><Row label="Expected Timing">{dv.projects.timing}</Row></>
          )}
          {dv.potential && ((dv.potential.items || []).length > 0 || dv.potential.product_application || dv.potential.current_brand || dv.potential.target_brand) && (
            <>
              <h4>Potential Product Opportunity</h4>
              <Tags items={dv.potential.items} other={dv.potential.other} />
              <Row label="Product / Application">{dv.potential.product_application}</Row>
              <Row label="Current Brand">{dv.potential.current_brand}</Row>
              <Row label="Target Brand / Product">{dv.potential.target_brand}</Row>
            </>
          )}
        </>
      )}

      {opp && ((opp.found || []).length > 0 || opp.level || opp.description) && (
        <>
          <h4>Opportunity Summary</h4>
          <Tags items={opp.found} />
          {opp.level && <p><b>Level:</b> <span className="vf-level-badge" style={{ '--dot': OPP_COLOR[opp.level] }}>{opp.level}</span></p>}
          <Row label="Description">{opp.description}</Row>
        </>
      )}

      {plan && ((plan.actions || []).length > 0 || (plan.rows || []).length > 0) && (
        <>
          <h4>Action Plan</h4>
          <Tags items={plan.actions} />
          {(plan.rows || []).map((a, i) => (
            <div className="vf-detail-card" key={a.id || i}>
              <b>{a.next_action || '-'}</b>
              <div className="muted">
                {[a.owner_name && `Owner: ${a.owner_name}`, a.contact && `Contact: ${a.contact}`, a.due_date && `Due: ${fmtDate(a.due_date)}`].filter(Boolean).join(' · ')}
              </div>
              {a.expected_result ? <div>Expected: {a.expected_result}</div> : null}
            </div>
          ))}
        </>
      )}

      {level && level.level && (level.level !== 'No Change' || level.reason) && (
        <>
          <h4>Customer Level</h4>
          <p><span className="vf-level-badge" style={{ '--dot': LEVEL_COLOR[level.level] }}>{level.level}</span></p>
          <Row label="Reason">{level.reason}</Row>
        </>
      )}

      {next && next.needed && (
        <>
          <h4>Next Visit</h4>
          {next.needed === 'yes' ? (
            <>
              <Row label="Date">{next.date ? fmtDate(next.date) : ''}</Row>
              <Row label="Purpose">{next.purpose}</Row>
              <Row label="Expected Outcome">{next.expected_outcome}</Row>
            </>
          ) : <p>No next visit planned</p>}
        </>
      )}
    </div>
  );
}
