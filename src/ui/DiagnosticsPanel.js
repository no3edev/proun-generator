import { createAccordionItem } from './accordion.js';
import { SceneConfig } from '../config/store.js';
import { Composition } from '../core/Composition.js';

// A read-only readout of what the current composition does, at the bottom of
// the Scene tab (collapsed). It changes nothing; it is there so the depth
// solver's behaviour can be seen and judged rather than tuned blindly. See
// generator/diagnostics.js for what each number means. It is only computed
// while the section is open.

const fmt = (x) => (Math.round(x * 10) / 10).toFixed(1);

/** @param {import('../generator/diagnostics.js').LayoutDiagnostics} d */
const ROWS = [
  ['Shapes', (d) => `${d.shapes}${d.solids !== d.shapes ? ` (${d.solids} solid)` : ''}`, 'How many shapes the composition has; a rod, frame or ring is not solid: it crosses other forms on purpose.'],
  ['Intersecting in 3D', (d) => `${d.trueIntersections}${d.anchorIntersections ? ` (${d.anchorIntersections} anchor)` : ''}`, 'Pairs of solid shapes whose real volumes intersect. These are errors; the aim is 0.'],
  ['Overlapping on screen', (d) => String(d.projectedOverlaps), 'Pairs of shapes whose silhouettes overlap on screen. Not an error: overlap is the look.'],
  ['Order changed', (d) => (d.hasPlan ? `${d.orderFlips} of ${d.orderPairs}` : '–'), 'Of the overlapping pairs the strategy put one in front of the other, how many the depth solver reversed. Needs a strategy.'],
  ['Depth shift', (d) => (d.hasPlan ? `${fmt(d.meanShift)} / ${fmt(d.maxShift)}` : '–'), 'How far the depth solver moved solid shapes from the depths the strategy planned: mean / maximum. Needs a strategy.'],
  ['Depth span', (d) => fmt(d.depthSpan), 'The spread of the shapes along the view axis.'],
  ['Outside camera', (d) => String(d.outsideCamera), 'Shapes beyond the camera\u2019s clip planes. Should be 0.']
];

export function initDiagnosticsPanel() {
  const container = document.getElementById('layout-diagnostics');
  if (!container) return;

  const { item, header, body } = createAccordionItem('Layout diagnostics', { startOpen: false });

  const values = ROWS.map(([label, , tip]) => {
    const row = document.createElement('div');
    row.className = 'diag-row';
    row.title = tip;
    const l = document.createElement('span');
    l.className = 'diag-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'diag-value';
    row.appendChild(l);
    row.appendChild(v);
    body.appendChild(row);
    return v;
  });

  const note = document.createElement('p');
  note.className = 'field-hint';
  note.textContent = 'Read-only. Intersections in 3D are errors; overlaps on screen are the look. Hover a row for what it counts.';
  body.appendChild(note);

  function update() {
    if (body.hidden) return; // only while it is open
    const d = Composition.diagnostics();
    ROWS.forEach(([, format], i) => { values[i].textContent = format(d); });
  }
  header.addEventListener('click', update); // runs after the toggle (createAccordionItem wired that first)
  SceneConfig.subscribe(update);

  container.appendChild(item);
}
