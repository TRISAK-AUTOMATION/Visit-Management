// client/src/components/VisitFormKit.jsx
// ชิ้นส่วน UI ที่ใช้ซ้ำในฟอร์ม Visit Request (Accordion / Field / Checkbox group / Radio cards / Multi picker)
// สไตล์อยู่ที่ pages/visit-form.css (prefix vf-)
import React, { useEffect, useMemo, useRef, useState } from 'react';

const Chevron = () => (
  <svg className="vf-chev" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 7.5l5 5 5-5" /></svg>
);
const SearchIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5L17 17" /></svg>
);

// ---------- Section (Accordion หลัก) ----------
// status: 'done' | 'error' | 'req' | '' (ชิปแสดงสถานะที่หัว section)
export function Section({ id, no, title, th, open, onToggle, status, statusText, summary, children }) {
  return (
    <section id={id} className={`vf-sec ${open ? 'open' : ''}`} data-vf-section={id}>
      <button type="button" className="vf-sec-head" aria-expanded={open} aria-controls={`${id}-body`} onClick={onToggle}>
        <span className="vf-sec-no">{no}</span>
        <span className="vf-sec-titles">
          <span className="vf-sec-en">{title}</span>
          {th && <span className="vf-sec-th">{th}</span>}
        </span>
        {summary ? <span className="vf-sec-summary">{summary}</span> : null}
        {statusText ? <span className={`vf-chip ${status || ''}`}>{statusText}</span> : null}
        <Chevron />
      </button>
      <div className="vf-sec-body" id={`${id}-body`}>{children}</div>
    </section>
  );
}

// ---------- SubAccordion (3.1 – 3.5) ----------
export function SubAccordion({ no, title, th, open, onToggle, summary, statusText, status, children }) {
  return (
    <div className={`vf-sub-acc ${open ? 'open' : ''}`}>
      <button type="button" className="vf-sub-head" aria-expanded={open} onClick={onToggle}>
        <span className="vf-sub-no">{no}</span>
        <span className="vf-sub-titles">
          <span className="vf-sub-en">{title}</span>
          {th && <span className="vf-sub-th">{th}</span>}
        </span>
        {summary ? <span className="vf-sub-summary">{summary}</span> : null}
        {statusText ? <span className={`vf-chip ${status || ''}`}>{statusText}</span> : null}
        <Chevron />
      </button>
      <div className="vf-sub-body">{children}</div>
    </div>
  );
}

// ---------- Group (หัวข้อย่อยในหน้า เช่น VISIT INFORMATION) ----------
export function Group({ title, th, tools, children }) {
  return (
    <div className="vf-group">
      <div className="vf-group-head">
        <span className="vf-group-en">{title}</span>
        {th && <span className="vf-group-th">{th}</span>}
        {tools ? <span className="vf-group-tools">{tools}</span> : null}
      </div>
      {children}
    </div>
  );
}

// ---------- Field ----------
// label = ภาษาอังกฤษ, th = คำอธิบายภาษาไทยตัวเล็กใต้ label
export function Field({ label, th, required, error, ok, full, hint, children, fid }) {
  return (
    <div className={`vf-field ${full ? 'full' : ''} ${error ? 'has-error' : ''} ${ok ? 'is-ok' : ''}`} data-vf-field={fid || undefined}>
      {label !== undefined && label !== null && (
        <div className="vf-label">
          <span className="vf-label-en">{label}{required && <span className="vf-req" aria-hidden="true">*</span>}</span>
          {th ? <span className="vf-label-th">{th}</span> : null}
        </div>
      )}
      {children}
      {error ? <div className="vf-msg err" role="alert">{error}</div> : hint ? <div className="vf-msg">{hint}</div> : null}
    </div>
  );
}

// ---------- Checkbox group ----------
// options: string[]  |  exclusive: ค่าที่เลือกแล้วต้องล้างตัวเลือกอื่น (เช่น "No Opportunity") และกลับกัน
export function CheckGroup({ options, value, onChange, exclusive = [] }) {
  const cur = Array.isArray(value) ? value : [];
  const toggle = (opt) => {
    if (cur.includes(opt)) return onChange(cur.filter(v => v !== opt));
    if (exclusive.includes(opt)) return onChange([opt]);
    onChange([...cur.filter(v => !exclusive.includes(v)), opt]);
  };
  return (
    <div className="vf-checks">
      {options.map(opt => (
        <label key={opt} className={`vf-check ${cur.includes(opt) ? 'on' : ''}`}>
          <input type="checkbox" checked={cur.includes(opt)} onChange={() => toggle(opt)} />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}

// ---------- Radio แบบ pill ----------
export function PillRadio({ name, options, value, onChange }) {
  return (
    <div className="vf-pills" role="radiogroup">
      {options.map(opt => {
        const v = typeof opt === 'string' ? opt : opt.value;
        const l = typeof opt === 'string' ? opt : opt.label;
        return (
          <label key={v} className={`vf-pill ${value === v ? 'on' : ''}`}>
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
            {l}
          </label>
        );
      })}
    </div>
  );
}

// ---------- Radio card ----------
// options: [{ value, label, desc, color, tint }]
export function RadioCards({ name, options, value, onChange }) {
  return (
    <div className="vf-cards" role="radiogroup">
      {options.map(o => (
        <label key={o.value} className={`vf-rcard ${value === o.value ? 'on' : ''}`} style={{ '--dot': o.color, '--tint': o.tint }}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          <div className="vf-rcard-top">
            <span className="vf-rcard-dot" />
            <span className="vf-rcard-name">{o.label}</span>
            <span className="vf-rcard-check">{value === o.value ? '✓' : ''}</span>
          </div>
          {o.desc ? <div className="vf-rcard-desc">{o.desc}</div> : null}
        </label>
      ))}
    </div>
  );
}

// ---------- Multi picker (ค้นหา + เลือกหลายรายการ + chips) ----------
// options: [{ value, label, sub? }] ; value: string[] (เก็บ value) ; allowCustom: พิมพ์ชื่อเองได้
export function MultiPicker({ options, value, onChange, placeholder = 'Search...', allowCustom = false, emptyText = 'ไม่พบรายการ', loading = false, customLabel = (t) => `+ เพิ่ม "${t}"` }) {
  const cur = Array.isArray(value) ? value : [];
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc); };
  }, [open]);

  const labelOf = (v) => { const o = options.find(x => x.value === v); return o ? o.label : v; };
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () => (needle ? options.filter(o => `${o.label} ${o.sub || ''}`.toLowerCase().includes(needle)) : options),
    [options, needle]
  );
  const typed = q.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const canAddTyped = allowCustom && typed && !cur.some(v => v.toLowerCase() === typed.toLowerCase())
    && !options.some(o => o.label.toLowerCase() === typed.toLowerCase());

  const toggle = (v) => onChange(cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]);
  const addTyped = () => { if (!canAddTyped) return; onChange([...cur, typed]); setQ(''); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHl(h => Math.min(h + 1, Math.max(shown.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHl(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && shown[hl]) toggle(shown[hl].value);
      else addTyped();
    } else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Backspace' && !q && cur.length) onChange(cur.slice(0, -1));
  };

  return (
    <div className={`vf-picker ${open ? 'open' : ''}`} ref={wrapRef}>
      {cur.length > 0 && (
        <div className="vf-chips">
          {cur.map(v => (
            <span key={v} className="vf-tag">
              <span title={labelOf(v)}>{labelOf(v)}</span>
              <button type="button" onClick={() => toggle(v)} aria-label={`Remove ${labelOf(v)}`}>&times;</button>
            </span>
          ))}
        </div>
      )}
      <div className="vf-picker-box">
        <SearchIcon />
        <input type="text" value={q} placeholder={placeholder} autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHl(0); }}
          onFocus={() => setOpen(true)} onKeyDown={onKey} />
      </div>
      {open && (
        <div className="vf-pop" role="listbox">
          {loading ? <div className="vf-pop-empty">กำลังโหลด...</div> : shown.length ? shown.map((o, i) => (
            <label key={o.value} className={`vf-opt ${i === hl ? 'hl' : ''}`} onMouseEnter={() => setHl(i)}>
              <input type="checkbox" checked={cur.includes(o.value)} onChange={() => toggle(o.value)} />
              <span><b>{o.label}</b></span>
              {o.sub ? <span className="vf-opt-sub">{o.sub}</span> : null}
            </label>
          )) : (!canAddTyped && <div className="vf-pop-empty">{emptyText}</div>)}
          {canAddTyped && <button type="button" className="vf-pop-add" onMouseDown={(e) => e.preventDefault()} onClick={addTyped}>{customLabel(typed)}</button>}
        </div>
      )}
    </div>
  );
}
