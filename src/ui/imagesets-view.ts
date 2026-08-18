import {
  IMAGE_SET_PLATFORMS,
  maxFactor,
  type BaseScale,
  type ImageSetPlatformId,
} from '../specs/imagesets';
import { buildImageSetPlan, generateImageSets, type ImageSetSource } from '../core/imagesets';
import { el, formatBytes, svgGlyph, triggerDownload } from './dom';
import { attachDropzone, readSource, type SourceImage } from './source';

const MAX_IMAGES = 60;

interface Entry extends ImageSetSource {
  readonly previewUrl: string;
  /** Stable across removals, so DOM diffing by index cannot mismatch. */
  readonly key: number;
}

interface State {
  entries: Entry[];
  base: BaseScale;
  platforms: Set<ImageSetPlatformId>;
  busy: boolean;
  nextKey: number;
}

const state: State = {
  entries: [],
  base: 4,
  platforms: new Set<ImageSetPlatformId>(['ios', 'android']),
  busy: false,
  nextKey: 1,
};

const dom = {
  dropzone: el<HTMLDivElement>('is-dropzone'),
  fileInput: el<HTMLInputElement>('is-file-input'),
  empty: el<HTMLDivElement>('is-empty'),
  list: el<HTMLUListElement>('is-list'),
  platforms: el<HTMLDivElement>('is-platforms'),
  warn: el<HTMLParagraphElement>('is-warn'),
  summary: el<HTMLDivElement>('is-summary'),
  generateBtn: el<HTMLButtonElement>('is-generate-btn'),
  progress: el<HTMLDivElement>('is-progress'),
  progressFill: el<HTMLSpanElement>('is-progress-fill'),
  progressText: el<HTMLParagraphElement>('is-progress-text'),
  error: el<HTMLParagraphElement>('is-error'),
};

/* --------------------------------------------------------------- platforms */

function buildPlatformPicker(): void {
  const frag = document.createDocumentFragment();

  for (const platform of IMAGE_SET_PLATFORMS) {
    const label = document.createElement('label');
    label.className = 'is-platform';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.platforms.has(platform.id);
    input.addEventListener('change', () => {
      if (input.checked) state.platforms.add(platform.id);
      else state.platforms.delete(platform.id);
      refresh();
    });

    const box = document.createElement('span');
    box.className = 'base-box';
    box.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'is-platform-label';
    name.textContent = platform.label;

    const hint = document.createElement('span');
    hint.className = 'is-platform-hint';
    hint.textContent = `- ${platform.hint}`;

    label.append(input, box, svgGlyph(platform.glyph, 'is-platform-glyph'), name, hint);
    frag.append(label);
  }

  dom.platforms.append(frag);
}

function bindBaseScale(): void {
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="base-scale"]')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      state.base = Number(radio.value) === 3 ? 3 : 4;
      refresh();
    });
  }
}

/* ------------------------------------------------------------------- files */

function toEntry(source: SourceImage, key: number): Entry {
  return {
    key,
    name: source.name,
    blob: source.blob,
    width: source.width,
    height: source.height,
    previewUrl: source.previewUrl,
  };
}

async function addFiles(files: readonly File[]): Promise<void> {
  showError(null);

  const room = MAX_IMAGES - state.entries.length;
  if (room <= 0) {
    showError(`That is the limit of ${MAX_IMAGES} images per batch.`);
    return;
  }

  const failures: string[] = [];
  for (const file of files.slice(0, room)) {
    try {
      state.entries.push(toEntry(await readSource(file), state.nextKey++));
    } catch (error) {
      failures.push(`${file.name}: ${error instanceof Error ? error.message : 'unreadable'}`);
    }
  }

  if (files.length > room) {
    failures.push(`${files.length - room} file(s) skipped — limit is ${MAX_IMAGES}.`);
  }
  if (failures.length > 0) showError(failures.join(' · '));

  renderList();
  refresh();
}

function removeEntry(key: number): void {
  const index = state.entries.findIndex((e) => e.key === key);
  if (index === -1) return;
  const [removed] = state.entries.splice(index, 1);
  if (removed) URL.revokeObjectURL(removed.previewUrl);
  renderList();
  refresh();
}

function clearAll(): void {
  for (const entry of state.entries) URL.revokeObjectURL(entry.previewUrl);
  state.entries = [];
  renderList();
  refresh();
}

function renderList(): void {
  const hasFiles = state.entries.length > 0;
  dom.empty.hidden = hasFiles;
  dom.list.hidden = !hasFiles;
  dom.dropzone.classList.toggle('has-files', hasFiles);

  if (!hasFiles) {
    dom.list.replaceChildren();
    dom.dropzone.setAttribute('tabindex', '0');
    dom.dropzone.setAttribute('role', 'button');
    return;
  }
  dom.dropzone.removeAttribute('tabindex');
  dom.dropzone.removeAttribute('role');

  const frag = document.createDocumentFragment();

  for (const entry of state.entries) {
    const item = document.createElement('li');
    item.className = 'is-item';

    const thumb = document.createElement('img');
    thumb.className = 'is-thumb';
    thumb.src = entry.previewUrl;
    thumb.alt = '';

    const meta = document.createElement('div');
    meta.className = 'is-item-meta';
    const name = document.createElement('p');
    name.className = 'is-item-name';
    name.textContent = entry.name;
    const dims = document.createElement('p');
    dims.className = 'is-item-dims';
    dims.textContent = `${entry.width} × ${entry.height}`;
    meta.append(name, dims);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'is-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${entry.name}`);
    remove.addEventListener('click', () => removeEntry(entry.key));

    item.append(thumb, meta, remove);
    frag.append(item);
  }

  const footer = document.createElement('li');
  footer.className = 'is-footer';
  const count = document.createElement('span');
  count.textContent = `${state.entries.length} image${state.entries.length === 1 ? '' : 's'}`;
  const actions = document.createElement('span');
  const addMore = document.createElement('button');
  addMore.type = 'button';
  addMore.className = 'btn-ghost';
  addMore.textContent = 'Add more';
  addMore.addEventListener('click', () => dom.fileInput.click());
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'btn-ghost';
  clear.textContent = 'Clear';
  clear.style.marginLeft = '0.4rem';
  clear.addEventListener('click', clearAll);
  actions.append(addMore, clear);
  footer.append(count, actions);
  frag.append(footer);

  dom.list.replaceChildren(frag);
}

/* ---------------------------------------------------------------- summary */

function strong(text: string): HTMLElement {
  const node = document.createElement('strong');
  node.textContent = text;
  return node;
}

function refresh(): void {
  const platforms = [...state.platforms];
  const ready = state.entries.length > 0 && platforms.length > 0 && !state.busy;
  dom.generateBtn.disabled = !ready;

  // A 3x base cannot supply Android xxxhdpi (4x) — say so instead of quietly
  // shipping an upscaled asset.
  const needed = maxFactor(platforms);
  if (platforms.length > 0 && needed > state.base) {
    dom.warn.textContent =
      `Android xxxhdpi needs ${needed}x but your base is ${state.base}x. ` +
      `Those variants will be upscaled — pick 4x, or re-export at ${needed}x.`;
    dom.warn.hidden = false;
  } else {
    dom.warn.hidden = true;
  }

  if (platforms.length === 0) {
    dom.summary.textContent = 'Select at least one platform.';
    return;
  }
  if (state.entries.length === 0) {
    dom.summary.textContent = 'Add one or more images to start.';
    return;
  }

  const plan = buildImageSetPlan(state.entries, { base: state.base, platforms });
  dom.summary.replaceChildren(
    strong(`${state.entries.length}`),
    document.createTextNode(` image${state.entries.length === 1 ? '' : 's'} — `),
    strong(`${plan.outputCount}`),
    document.createTextNode(' files from '),
    strong(`${plan.jobs.length}`),
    document.createTextNode(' renders'),
  );
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
  if (state.busy || state.entries.length === 0) return;

  state.busy = true;
  showError(null);
  dom.generateBtn.disabled = true;
  dom.progress.hidden = false;
  setProgress(0, 1);

  try {
    const result = await generateImageSets(
      state.entries,
      { base: state.base, platforms: [...state.platforms] },
      setProgress,
    );
    triggerDownload(result.blob, 'ImageSets.zip');
    dom.progressText.textContent = `Done — ${result.fileCount} files, ${formatBytes(
      result.bytes,
    )} in ${result.elapsedMs} ms`;
  } catch (error) {
    dom.progress.hidden = true;
    showError(error instanceof Error ? error.message : 'Generation failed.');
  } finally {
    state.busy = false;
    refresh();
  }
}

/* ------------------------------------------------------------------ public */

export interface ImageSetsView {
  acceptFiles(files: readonly File[]): void;
}

export function initImageSetsView(): ImageSetsView {
  buildPlatformPicker();
  bindBaseScale();

  const accept = (files: readonly File[]) => void addFiles(files);
  attachDropzone(dom.dropzone, dom.fileInput, accept, () => state.entries.length > 0);
  dom.generateBtn.addEventListener('click', () => void runGenerate());

  refresh();
  return { acceptFiles: accept };
}
