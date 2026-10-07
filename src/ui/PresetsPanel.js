import { PresetStore, MAX_PRESETS } from '../presets/PresetStore.js';
import { captureSnapshot, applySnapshot } from '../presets/SceneSnapshot.js';
import { createAccordionItem } from './accordion.js';

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function slug(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'preset';
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Builds the "Presets" accordion section into `container`: a name
 * field + Save, the saved-preset list (Load / Export / Delete per
 * row, capped at MAX_PRESETS — saving past the cap drops the oldest),
 * and Export all / Import.
 *
 * `intervalMs`/`autoAdvance` live only as DOM state in Panel.js (no
 * module owns them — see SceneSnapshot.js), so this needs a few hooks
 * back into Panel.js rather than reaching into its DOM directly.
 *
 * @param {HTMLElement} container
 * @param {{
 *   getIntervalMs: () => number,
 *   getAutoAdvance: () => boolean,
 *   applyTimeControls: (time: {durationMs:number, intervalMs:number, autoAdvance:boolean}) => void,
 *   syncTopControls: (palette: string, orientation: string) => void,
 *   refreshShapeSettings: () => void
 * }} hooks
 */
export function buildPresetsPanel(container, hooks) {
  const { item, body } = createAccordionItem('Presets');

  // --- save ---
  const saveField = document.createElement('div');
  saveField.className = 'field';
  const saveRow = document.createElement('div');
  saveRow.className = 'row preset-save-row';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Name';
  nameInput.maxLength = 60;
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  saveRow.appendChild(nameInput);
  saveRow.appendChild(saveBtn);
  saveField.appendChild(saveRow);
  body.appendChild(saveField);

  const countLabel = document.createElement('div');
  countLabel.className = 'preset-count';
  body.appendChild(countLabel);

  // --- saved list ---
  const list = document.createElement('div');
  list.className = 'preset-list';
  body.appendChild(list);

  // --- export all / import ---
  const ioRow = document.createElement('div');
  ioRow.className = 'row preset-io-row';
  const exportAllBtn = document.createElement('button');
  exportAllBtn.type = 'button';
  exportAllBtn.textContent = 'Export all';
  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.textContent = 'Import';
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.hidden = true;
  ioRow.appendChild(exportAllBtn);
  ioRow.appendChild(importBtn);
  body.appendChild(ioRow);
  body.appendChild(importInput);

  const statusEl = document.createElement('div');
  statusEl.className = 'preset-status';
  body.appendChild(statusEl);

  let statusTimer = null;
  function setStatus(msg) {
    statusEl.textContent = msg;
    if (statusTimer) clearTimeout(statusTimer);
    if (msg) statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 4000);
  }

  function loadPreset(p) {
    const applied = applySnapshot(p);
    hooks.syncTopControls(applied.palette, applied.orientation);
    hooks.applyTimeControls(applied.time);
    hooks.refreshShapeSettings();
    setStatus(`Loaded "${p.name}".`);
  }

  function render() {
    const presets = PresetStore.list();
    countLabel.textContent = `${presets.length} / ${MAX_PRESETS}`;
    list.innerHTML = '';

    if (presets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'preset-empty';
      empty.textContent = 'None saved';
      list.appendChild(empty);
      return;
    }

    presets.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'preset-row';
      row.title = `${p.name} — ${formatDate(p.createdAt)}`; // date moves to a tooltip now that the row is one line

      const nameEl = document.createElement('div');
      nameEl.className = 'preset-name';
      nameEl.textContent = p.name;

      const actions = document.createElement('div');
      actions.className = 'preset-actions';

      function iconBtn(glyph, label, onClick, extraClass) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'icon-btn' + (extraClass ? ` ${extraClass}` : '');
        btn.textContent = glyph;
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.addEventListener('click', onClick);
        return btn;
      }

      const loadBtn = iconBtn('▶', 'Load preset', () => loadPreset(p));
      const exportBtn = iconBtn('↓', 'Export preset', () => {
        downloadText(`${slug(p.name)}.json`, PresetStore.exportOne(p.id));
      });
      const deleteBtn = iconBtn('✕', 'Delete preset', () => {
        if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
        PresetStore.delete(p.id);
        render();
        setStatus(`Deleted "${p.name}".`);
      }, 'danger');

      actions.appendChild(loadBtn);
      actions.appendChild(exportBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(nameEl);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  saveBtn.addEventListener('click', () => {
    const snapshot = captureSnapshot({
      intervalMs: hooks.getIntervalMs(),
      autoAdvance: hooks.getAutoAdvance()
    });
    const name = nameInput.value.trim() || `Preset ${PresetStore.list().length + 1}`;
    const wasFull = PresetStore.list().length >= MAX_PRESETS;
    PresetStore.save(name, snapshot);
    nameInput.value = '';
    render();
    setStatus(wasFull ? `Saved "${name}" — oldest preset dropped (limit ${MAX_PRESETS}).` : `Saved "${name}".`);
  });

  exportAllBtn.addEventListener('click', () => {
    if (PresetStore.list().length === 0) { setStatus('Nothing to export yet.'); return; }
    downloadText(`proun-presets-${Date.now()}.json`, PresetStore.exportAll());
  });

  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = ''; // so selecting the same file again still fires 'change'
    if (!file) return;
    try {
      const text = await file.text();
      const result = PresetStore.importJSON(text);
      render();
      if (result.error) setStatus(result.error);
      else setStatus(`Imported ${result.imported}${result.skipped ? `, skipped ${result.skipped}` : ''}.`);
    } catch (err) {
      setStatus('Could not read that file.');
    }
  });

  render();
  container.appendChild(item);
}
