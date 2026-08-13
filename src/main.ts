import './style.css';

import { LAYOUTS, PLATFORMS, PLATFORM_BY_ID } from './specs';
import type { GenerateOptions, LayoutId, PlatformId } from './specs/types';
import { buildPlan } from './core/plan';
import { generate } from './core/generate';
import { renderIcon } from './core/render';
import { el, formatBytes, normaliseHex, svgGlyph } from './ui/dom';
import {
  attachSourcePicker,
  disposeSource,
  readSource,
  sourceWarning,
  type SourceImage,
} from './ui/source';

/* ------------------------------------------------------------------- state */

interface State {
  source: SourceImage | null;
  selected: Set<PlatformId>;
  layout: LayoutId;
  background: string;
  appName: string;
  forceOpaqueApple: boolean;
  busy: boolean;
}

const state: State = {
  source: null,
  selected: new Set(PLATFORMS.filter((p) => p.defaultOn).map((p) => p.id)),
  layout: 'standard',
  background: '#ffffff',
  appName: 'My App',
  forceOpaqueApple: false,
  busy: false,
};

const options = (): GenerateOptions => ({
  layout: state.layout,
  background: state.background,
  appName: state.appName.trim() || 'My App',
  forceOpaqueApple: state.forceOpaqueApple,
});

/* --------------------------------------------------------------- elements */

const dom = {
  dropzone: el<HTMLDivElement>('dropzone'),
  fileInput: el<HTMLInputElement>('file-input'),
  empty: el<HTMLDivElement>('dropzone-empty'),
  filled: el<HTMLDivElement>('dropzone-filled'),
  sourceImg: el<HTMLImageElement>('source-img'),
  sourceName: el<HTMLParagraphElement>('source-name'),
  sourceDims: el<HTMLParagraphElement>('source-dims'),
  sourceWarn: el<HTMLParagraphElement>('source-warn'),
  clearBtn: el<HTMLButtonElement>('clear-btn'),
  platformGrid: el<HTMLDivElement>('platform-grid'),
  layoutSelect: el<HTMLSelectElement>('layout-select'),
  layoutHint: el<HTMLSpanElement>('layout-hint'),
  appName: el<HTMLInputElement>('app-name'),
  bgColor: el<HTMLInputElement>('bg-color'),
  bgHex: el<HTMLInputElement>('bg-hex'),
  forceOpaque: el<HTMLInputElement>('force-opaque'),
  summary: el<HTMLDivElement>('summary'),
  generateBtn: el<HTMLButtonElement>('generate-btn'),
  progress: el<HTMLDivElement>('progress'),
  progressFill: el<HTMLSpanElement>('progress-fill'),
  progressText: el<HTMLParagraphElement>('progress-text'),
  error: el<HTMLParagraphElement>('error'),
  previewWrap: el<HTMLDivElement>('preview-wrap'),
  previewGrid: el<HTMLDivElement>('preview-grid'),
  sizeTables: el<HTMLDivElement>('size-tables'),
};

/* ------------------------------------------------------------ platform UI */

function buildPlatformPicker(): void {
  const frag = document.createDocumentFragment();

  for (const platform of PLATFORMS) {
    const label = document.createElement('label');
    label.className = 'platform';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.selected.has(platform.id);
    input.addEventListener('change', () => {
      if (input.checked) state.selected.add(platform.id);
      else state.selected.delete(platform.id);
      refreshSummary();
    });

    const text = document.createElement('span');
    text.innerHTML = '';
    const name = document.createElement('span');
    name.className = 'platform-label';
    name.textContent = platform.label;
    const hint = document.createElement('span');
    hint.className = 'platform-hint';
    hint.textContent = platform.hint;
    text.append(name, hint);

    const check = document.createElement('span');
    check.className = 'platform-check';

    label.append(input, svgGlyph(platform.glyph, 'platform-glyph'), text, check);
    frag.append(label);
  }

  dom.platformGrid.append(frag);
}

function buildLayoutSelect(): void {
  for (const layout of LAYOUTS) {
    const option = document.createElement('option');
    option.value = layout.id;
    option.textContent = layout.label;
    dom.layoutSelect.append(option);
  }
  dom.layoutSelect.value = state.layout;
  syncLayoutHint();

  dom.layoutSelect.addEventListener('change', () => {
    state.layout = dom.layoutSelect.value as LayoutId;
    syncLayoutHint();
    refreshSummary();
  });
}

function syncLayoutHint(): void {
  dom.layoutHint.textContent = LAYOUTS.find((l) => l.id === state.layout)?.hint ?? '';
}

/** Static reference tables in the "Every size" section. */
function buildSizeTables(): void {
  const frag = document.createDocumentFragment();

  for (const platform of PLATFORMS) {
    const card = document.createElement('div');
    card.className = 'size-card';

    const h3 = document.createElement('h3');
    h3.textContent = platform.label;

    const p = document.createElement('p');
    const unique = new Set(platform.specs.map((s) => s.px));
    p.textContent = `${platform.specs.length} files · ${unique.size} distinct sizes`;

    const chips = document.createElement('div');
    chips.className = 'size-chips';
    for (const px of [...unique].sort((a, b) => a - b)) {
      const chip = document.createElement('span');
      chip.className = 'size-chip';
      chip.textContent = `${px}`;
      chips.append(chip);
    }

    card.append(h3, p, chips);
    frag.append(card);
  }

  dom.sizeTables.append(frag);
}

/* --------------------------------------------------------------- summary */

function refreshSummary(): void {
  const selected = [...state.selected];
  const ready = state.source !== null && selected.length > 0 && !state.busy;
  dom.generateBtn.disabled = !ready;

  if (selected.length === 0) {
    dom.summary.textContent = 'Select at least one platform.';
    return;
  }

  const plan = buildPlan(selected, options());
  const names = selected
    .map((id) => PLATFORM_BY_ID.get(id)?.label)
    .filter((n): n is string => Boolean(n));

  dom.summary.innerHTML = '';
  dom.summary.append(
    document.createTextNode(names.join(', ') + ' — '),
    strong(`${plan.outputCount}`),
    document.createTextNode(' files from '),
    strong(`${plan.jobs.length}`),
    document.createTextNode(' renders'),
  );

  if (!state.source) {
    dom.summary.append(document.createTextNode(' · add an image to start'));
  }
}

function strong(text: string): HTMLElement {
  const node = document.createElement('strong');
  node.textContent = text;
  return node;
}

/* ---------------------------------------------------------------- preview */

const previewSizes = [180, 120, 87, 60, 40] as const;

async function refreshPreview(): Promise<void> {
  const source = state.source;
  if (!source) {
    dom.previewWrap.hidden = true;
    dom.previewGrid.replaceChildren();
    return;
  }

  const bitmap = await createImageBitmap(source.blob);
  const frag = document.createDocumentFragment();

  for (const px of previewSizes) {
    const canvas = renderIcon(bitmap, px, 'contain', state.background);
    const blob = await canvas.convertToBlob({ type: 'image/png' });

    const item = document.createElement('div');
    item.className = 'preview-item';

    const img = document.createElement('img');
    img.width = px > 84 ? 84 : px;
    img.height = img.width;
    img.alt = `${px} by ${px} pixel preview`;
    img.src = URL.createObjectURL(blob);
    // The grid is rebuilt wholesale on every change; releasing on load keeps
    // repeated colour tweaks from leaking a URL per swatch.
    img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true });

    const caption = document.createElement('span');
    caption.textContent = `${px}px`;

    item.append(img, caption);
    frag.append(item);
  }

  bitmap.close();
  dom.previewGrid.replaceChildren(frag);
  dom.previewWrap.hidden = false;
}

/* ------------------------------------------------------------ source flow */

async function acceptFile(file: File): Promise<void> {
  showError(null);
  try {
    const next = await readSource(file);
    disposeSource(state.source);
    state.source = next;

    dom.sourceImg.src = next.previewUrl;
    dom.sourceName.textContent = next.name;
    dom.sourceDims.textContent = `${next.width} × ${next.height}`;

    const warning = sourceWarning(next);
    dom.sourceWarn.textContent = warning ?? '';
    dom.sourceWarn.hidden = warning === null;

    dom.empty.hidden = true;
    dom.filled.hidden = false;
    dom.dropzone.classList.add('has-file');
    dom.dropzone.removeAttribute('tabindex');
    dom.dropzone.removeAttribute('role');

    refreshSummary();
    await refreshPreview();
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Could not read that file.');
  }
}

function clearSource(): void {
  disposeSource(state.source);
  state.source = null;
  dom.sourceImg.removeAttribute('src');
  dom.empty.hidden = false;
  dom.filled.hidden = true;
  dom.dropzone.classList.remove('has-file');
  dom.dropzone.setAttribute('tabindex', '0');
  dom.dropzone.setAttribute('role', 'button');
  dom.previewWrap.hidden = true;
  dom.previewGrid.replaceChildren();
  refreshSummary();
}

function showError(message: string | null): void {
  dom.error.textContent = message ?? '';
  dom.error.hidden = message === null;
}

/* --------------------------------------------------------------- generate */

function setProgress(done: number, total: number): void {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  dom.progressFill.style.width = `${pct}%`;
  dom.progressText.textContent = `Rendering ${done} / ${total}`;
}

async function runGenerate(): Promise<void> {
  const source = state.source;
  if (!source || state.busy) return;

  state.busy = true;
  showError(null);
  dom.generateBtn.disabled = true;
  dom.progress.hidden = false;
  setProgress(0, 1);

  try {
    const result = await generate(source.blob, [...state.selected], options(), setProgress);

    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'AppIcons.zip';
    anchor.click();
    // Give the download a tick to latch onto the URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);

    dom.progressText.textContent = `Done — ${result.fileCount} files, ${formatBytes(
      result.bytes,
    )} in ${result.elapsedMs} ms`;
  } catch (error) {
    dom.progress.hidden = true;
    showError(error instanceof Error ? error.message : 'Generation failed.');
  } finally {
    state.busy = false;
    refreshSummary();
  }
}

/* ------------------------------------------------------------------ wiring */

function bindOptions(): void {
  dom.appName.addEventListener('input', () => {
    state.appName = dom.appName.value;
  });

  const applyBackground = (hex: string) => {
    state.background = hex;
    dom.bgColor.value = hex;
    dom.bgHex.value = hex;
    void refreshPreview();
  };

  dom.bgColor.addEventListener('input', () => applyBackground(dom.bgColor.value.toLowerCase()));
  dom.bgHex.addEventListener('change', () => {
    const hex = normaliseHex(dom.bgHex.value);
    if (hex) applyBackground(hex);
    else dom.bgHex.value = state.background;
  });

  dom.forceOpaque.addEventListener('change', () => {
    state.forceOpaqueApple = dom.forceOpaque.checked;
  });

  dom.clearBtn.addEventListener('click', clearSource);
  dom.generateBtn.addEventListener('click', () => void runGenerate());
}

function init(): void {
  buildPlatformPicker();
  buildLayoutSelect();
  buildSizeTables();
  bindOptions();
  attachSourcePicker(dom.dropzone, dom.fileInput, (file) => void acceptFile(file));
  refreshSummary();
}

init();
