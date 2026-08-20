import {
  IMAGE_SET_PLATFORMS,
  maxFactor,
  type BaseScale,
  type ImageSetPlatformId,
} from '../specs/imagesets';
import { buildImageSetPlan, generateImageSets } from '../core/imagesets';
import { androidName, uniqueName, xcodeName } from '../core/naming';
import { el, formatBytes, svgGlyph, triggerDownload } from './dom';
import { attachDropzone, readSource, type SourceImage } from './source';

const MAX_IMAGES = 60;

/**
 * `name` is mutable: it is what the user renames, and it is also the resource
 * identifier the archive is built from. Structurally still an `ImageSetSource`.
 */
interface Entry {
  name: string;
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly previewUrl: string;
  /** Stable across removals, so list rebuilds cannot mismatch rows. */
  readonly key: number;
}

interface State {
  entries: Entry[];
  base: BaseScale;
  platforms: Set<ImageSetPlatformId>;
  busy: boolean;
  nextKey: number;
  /** Key of the row currently being renamed, or null. */
  editingKey: number | null;
}

const state: State = {
  entries: [],
  base: 4,
  platforms: new Set<ImageSetPlatformId>(['ios', 'android']),
  busy: false,
  nextKey: 1,
  editingKey: null,
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
  if (state.editingKey === key) state.editingKey = null;
  renderList();
  refresh();
}

function clearAll(): void {
  for (const entry of state.entries) URL.revokeObjectURL(entry.previewUrl);
  state.entries = [];
  state.editingKey = null;
  renderList();
  refresh();
}

/**
 * The names each entry will actually ship under, computed for the whole list at
 * once.
 *
 * Doing this per row would be a lie: `Logo.png` and `logo.png` both sanitise to
 * `logo` on Android, and the archive resolves that by appending `_2`. Running
 * the same dedup the plan runs means the label matches the file that lands on
 * disk, collision suffix included.
 */
function derivedNames(): Map<number, string> {
  const takenIos = new Set<string>();
  const takenAndroid = new Set<string>();
  const out = new Map<number, string>();

  for (const entry of state.entries) {
    const ios = uniqueName(xcodeName(entry.name), takenIos);
    const android = uniqueName(androidName(entry.name), takenAndroid);
    out.set(entry.key, ios === android ? ios : `${ios} · ${android}`);
  }
  return out;
}

function beginEdit(key: number): void {
  state.editingKey = key;
  renderList();
}

function commitEdit(entry: Entry, value: string): void {
  const trimmed = value.trim();
  // An empty name would sanitise to the literal fallback "image", which is
  // almost certainly not what someone who cleared the field meant. Keep the old
  // one instead of inventing a name.
  if (trimmed !== '') entry.name = trimmed;
  state.editingKey = null;
  renderList();
  refresh();
}

function cancelEdit(): void {
  state.editingKey = null;
  renderList();
}

function buildNameCell(entry: Entry, derived: string): HTMLElement {
  const meta = document.createElement('div');
  meta.className = 'is-item-meta';

  if (state.editingKey === entry.key) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'is-rename';
    input.value = entry.name;
    input.maxLength = 120;
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Asset name');

    let settled = false;
    const commit = () => {
      if (settled) return;
      settled = true;
      commitEdit(entry, input.value);
    };

    input.addEventListener('keydown', (event) => {
      // Stop Enter/Space reaching the dropzone, which would open a file picker.
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        settled = true;
        cancelEdit();
      }
    });
    // Blur also commits, so clicking elsewhere does not silently discard.
    input.addEventListener('blur', commit);

    const sub = document.createElement('p');
    sub.className = 'is-item-dims';
    sub.textContent = `${entry.width} × ${entry.height} · ${derived}`;

    meta.append(input, sub);
    // Focus after the row is in the document; selecting the stem lets the user
    // retype the name without clobbering an extension they want to keep.
    queueMicrotask(() => {
      input.focus();
      const dot = input.value.lastIndexOf('.');
      input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
    });
    return meta;
  }

  const name = document.createElement('p');
  name.className = 'is-item-name';
  name.textContent = entry.name;

  const dims = document.createElement('p');
  dims.className = 'is-item-dims';
  dims.textContent = `${entry.width} × ${entry.height} · ${derived}`;
  dims.title = 'Names this asset will ship under (iOS · Android)';

  meta.append(name, dims);
  return meta;
}

function iconButton(label: string, path: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(svgGlyph(path, 'is-btn-glyph'));
  return button;
}

const PENCIL =
  'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z';
const CROSS = 'M18.3 5.71L12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.3 19.71 2.88 18.3 9.17 12 2.88 5.71 4.3 4.3l6.29 6.29L16.88 4.3z';

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
  const derived = derivedNames();

  for (const entry of state.entries) {
    const item = document.createElement('li');
    item.className = 'is-item';
    if (state.editingKey === entry.key) item.classList.add('is-editing');

    const thumb = document.createElement('img');
    thumb.className = 'is-thumb';
    thumb.src = entry.previewUrl;
    thumb.alt = '';

    const edit = iconButton(`Rename ${entry.name}`, PENCIL, 'is-icon-btn');
    edit.addEventListener('click', () => beginEdit(entry.key));

    const remove = iconButton(`Remove ${entry.name}`, CROSS, 'is-icon-btn is-remove');
    remove.addEventListener('click', () => removeEntry(entry.key));

    item.append(thumb, buildNameCell(entry, derived.get(entry.key) ?? ''), edit, remove);
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
