// Perception: enumerate the VISIBLE fillable controls on the active step, compute each
// one's accessible name (the load-bearing binding), stamp a code-owned handle, and read
// the format-driving attributes. Radios are collapsed into one descriptor per group.

import type { Page } from 'playwright';
import type { FieldDescriptor } from '../types.js';

export async function perceive(page: Page): Promise<FieldDescriptor[]> {
  const raw = await page.evaluate(() => {
    // ---- helpers (must be self-contained: this runs in the browser) ----
    let counter: number = (window as any).__agentUid || 0;
    const stamp = (el: Element): string => {
      let u = el.getAttribute('data-agent-uid');
      if (!u) { u = 'f' + ++counter; el.setAttribute('data-agent-uid', u); }
      return u;
    };
    const clean = (s: string | null | undefined) =>
      (s || '').replace(/\s+/g, ' ').replace(/\*+$/, '').trim();

    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const cs = getComputedStyle(el as HTMLElement);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    };

    const groupContext = (el: Element): string => {
      let cur: Element | null = el;
      while (cur && cur !== document.body) {
        const lg = cur.querySelector(':scope > legend');
        if (lg && clean(lg.textContent)) return clean(lg.textContent);
        cur = cur.parentElement;
      }
      return '';
    };

    interface Cand { source: string; text: string; confidence: number; }
    const labelFor = (el: Element): Cand[] => {
      const c: Cand[] = [];
      const lb = el.getAttribute('aria-labelledby');
      if (lb) {
        const t = lb.split(/\s+/).map((id) => clean(document.getElementById(id)?.textContent)).filter(Boolean).join(' ');
        if (t) c.push({ source: 'aria-labelledby', text: t, confidence: 0.98 });
      }
      const al = el.getAttribute('aria-label');
      if (clean(al)) c.push({ source: 'aria-label', text: clean(al), confidence: 0.9 });
      const id = (el as HTMLElement).id;
      if (id) {
        const lf = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lf && clean(lf.textContent)) c.push({ source: 'label-for', text: clean(lf.textContent), confidence: 0.95 });
      }
      const wrap = el.closest('label');
      if (wrap && clean(wrap.textContent)) c.push({ source: 'wrap-label', text: clean(wrap.textContent), confidence: 0.93 });
      // table-cell inputs: bind to the row's <th scope=row> and/or the column header
      const cell = el.closest('td, th');
      if (cell) {
        const tr = cell.closest('tr');
        const table = cell.closest('table');
        if (tr) {
          const rowTh = tr.querySelector('th[scope="row"]') || tr.querySelector('th');
          if (rowTh && rowTh !== cell && clean(rowTh.textContent)) c.push({ source: 'th-row', text: clean(rowTh.textContent), confidence: 0.85 });
          if (table) {
            const headRow = table.querySelector('thead tr') || table.querySelector('tr');
            if (headRow && headRow !== tr) {
              const colTh = headRow.children[Array.from(tr.children).indexOf(cell)];
              if (colTh && clean(colTh.textContent)) c.push({ source: 'th-col', text: clean(colTh.textContent), confidence: 0.85 });
            }
          }
        }
      }
      // preceding label-like element (many forms bind labels by adjacency, not for=,
      // and use <span>/<div> instead of <label>).
      let p = el.previousElementSibling, steps = 0;
      while (p && steps < 3) {
        const t = clean(p.textContent);
        const hasControl = p.querySelector('input,select,textarea');
        if (t && t.length < 120 && !hasControl) {
          const cls = p.getAttribute('class') || '';
          if (p.tagName === 'LABEL') { c.push({ source: 'prev-label', text: t, confidence: 0.88 }); break; }
          if (/\b(lab|label|field-?label|control-label|form-label)\b/i.test(cls)) { c.push({ source: 'label-class', text: t, confidence: 0.85 }); break; }
          if (steps === 0 && /SPAN|DIV|P|STRONG|B|H[1-6]/.test(p.tagName) && t.length < 70) { c.push({ source: 'prev-text', text: t, confidence: 0.72 }); break; }
          if (/SPAN|DIV|P|H[1-6]/.test(p.tagName)) { c.push({ source: 'proximity', text: t, confidence: 0.55 }); break; }
        }
        p = p.previousElementSibling; steps++;
      }
      const ph = (el as HTMLInputElement).placeholder;
      if (clean(ph)) {
        const hint = /mm.?dd|dd.?mm|yyyy|e\.?g\.?|xx-x|digits|format|\d{3}/i.test(ph);
        c.push({ source: 'placeholder', text: clean(ph), confidence: hint ? 0.2 : 0.4 });
      }
      const nm = (el as HTMLInputElement).name || id;
      if (nm) c.push({ source: 'name-id', text: nm.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-]+/g, ' '), confidence: 0.3 });
      return c;
    };

    const groupQuestion = (firstRadio: Element): string => {
      let cur: Element | null = firstRadio.closest('label') || firstRadio;
      while (cur && cur !== document.body) {
        let p = cur.previousElementSibling, steps = 0;
        while (p && steps < 5) {
          if ((p.tagName === 'LABEL' || /H[1-6]|LEGEND|P|DIV/.test(p.tagName)) && !p.querySelector('input,select,textarea')) {
            const t = clean(p.textContent);
            if (t && t.length < 160) return t;
          }
          p = p.previousElementSibling; steps++;
        }
        cur = cur.parentElement;
      }
      return '';
    };

    const kindOf = (el: Element): string => {
      const tag = el.tagName;
      if (tag === 'SELECT') return 'select';
      if (tag === 'TEXTAREA') return 'textarea';
      const t = ((el as HTMLInputElement).type || 'text').toLowerCase();
      if (['radio', 'checkbox', 'number', 'email', 'tel', 'url', 'date'].includes(t)) return t;
      return 'text';
    };

    const pickLabel = (cands: Cand[]) => {
      const best = [...cands].sort((a, b) => b.confidence - a.confidence)[0];
      return best || { source: 'none', text: '', confidence: 0 };
    };

    // ---- walk controls in document order ----
    const out: any[] = [];
    const radioGroups = new Map<string, HTMLInputElement[]>();
    let order = 0;
    const controls = Array.from(document.querySelectorAll('input, select, textarea')) as HTMLElement[];

    for (const el of controls) {
      const t = ((el as HTMLInputElement).type || '').toLowerCase();
      if (el.tagName === 'INPUT' && ['hidden', 'submit', 'button', 'reset', 'image'].includes(t)) continue;
      if (!visible(el)) continue;
      if (t === 'radio') {
        const name = (el as HTMLInputElement).name || 'radio_' + order;
        if (!radioGroups.has(name)) radioGroups.set(name, []);
        radioGroups.get(name)!.push(el as HTMLInputElement);
        continue;
      }
      const uid = stamp(el);
      const cands = labelFor(el);
      const best = pickLabel(cands);
      const d: any = {
        uid, selector: `[data-agent-uid="${uid}"]`, kind: kindOf(el),
        label: { name: best.text, source: best.source, confidence: best.confidence, group: groupContext(el), candidates: cands },
        name: (el as HTMLInputElement).name || undefined, id: el.id || undefined,
        inputType: (el as HTMLInputElement).type || undefined,
        placeholder: (el as HTMLInputElement).placeholder || undefined,
        describedBy: (() => { const ids = el.getAttribute('aria-describedby'); return ids ? ids.split(/\s+/).map((id) => clean(document.getElementById(id)?.textContent)).filter(Boolean).join(' ') || undefined : undefined; })(),
        pattern: (el as HTMLInputElement).pattern || undefined,
        maxLength: (el as HTMLInputElement).maxLength > 0 ? (el as HTMLInputElement).maxLength : undefined,
        required: (el as HTMLInputElement).required || false,
        disabled: (el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly || false,
        currentValue: (el as HTMLInputElement).value || undefined,
        domOrder: order++,
      };
      if (el.tagName === 'SELECT') {
        d.options = Array.from((el as HTMLSelectElement).options)
          .map((o) => ({ value: o.value, text: clean(o.textContent) }))
          .filter((o) => !(o.value === '' && /select|choose|--|^\s*$/i.test(o.text)));
      }
      out.push(d);
    }

    // emit one descriptor per radio group
    for (const [name, radios] of radioGroups) {
      const first = radios[0];
      const uid = stamp(first);
      const options = radios.map((r) => {
        const wl = r.closest('label');
        let text = wl ? clean(wl.textContent) : '';
        if (!text && r.id) { const lf = document.querySelector(`label[for="${CSS.escape(r.id)}"]`); text = clean(lf?.textContent); }
        if (!text) text = clean((r.nextSibling as any)?.textContent) || r.value;
        return { value: r.value, text, uid: stamp(r) };
      });
      const q = groupQuestion(first);
      const grp = groupContext(first);
      out.push({
        uid, selector: `[data-agent-uid="${uid}"]`, kind: 'radio',
        label: { name: q || grp, source: q ? 'group-label' : 'group-legend', confidence: q ? 0.9 : (grp ? 0.6 : 0.2), group: grp, candidates: [] },
        name, radioGroup: name, required: radios.some((r) => r.required), disabled: false, options, domOrder: order++,
      });
    }

    (window as any).__agentUid = counter;
    return out;
  });

  return raw as FieldDescriptor[];
}
