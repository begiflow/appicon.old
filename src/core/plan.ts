/**
 * Turns a platform selection into a concrete render + archive plan.
 *
 * Two things happen here that matter for correctness and speed:
 *
 * 1. **Deduplication.** iPhone 20pt@2x and iPad 40pt@1x are both 40px with the
 *    same render mode, and iPhone/iPad/watchOS all want a 1024px marketing
 *    icon. Rendering each `(px, mode)` pair once and fanning it out to every
 *    destination path cuts a full seven-platform run from ~70 renders to ~45.
 * 2. **Catalog grouping.** iPhone and iPad share a single `AppIcon.appiconset`,
 *    so their specs must be merged before `Contents.json` is written or the
 *    second platform silently overwrites the first.
 */

import { LAYOUT_BY_ID, PLATFORM_BY_ID } from '../specs';
import { ICO_SIZES } from '../specs/web';
import type { GenerateOptions, IconSpec, PlatformId, RenderMode, TextFile } from '../specs/types';
import type { RenderJob } from './protocol';
import { buildContentsJson, buildRootContentsJson } from './catalog';

/** A single file in the output archive, sourced from a rendered PNG. */
export interface PlannedFile {
  readonly zipPath: string;
  readonly jobId: string;
}

/** A `favicon.ico` to assemble once its member PNGs are rendered. */
export interface PlannedIco {
  readonly zipPath: string;
  readonly members: readonly { readonly size: number; readonly jobId: string }[];
}

export interface Plan {
  readonly jobs: readonly RenderJob[];
  readonly files: readonly PlannedFile[];
  readonly icos: readonly PlannedIco[];
  readonly texts: readonly TextFile[];
  /** Number of files the user will actually receive, for the summary line. */
  readonly outputCount: number;
}

const jobId = (px: number, mode: RenderMode): string => `${mode}@${px}`;

function effectiveMode(spec: IconSpec, isApple: boolean, opts: GenerateOptions): RenderMode {
  const mode = spec.mode ?? 'contain';
  // `forceOpaqueApple` flattens alpha everywhere in the Apple catalogs, which
  // some teams want because iOS composites app icons on an opaque tile anyway.
  if (isApple && opts.forceOpaqueApple && mode === 'contain') return 'opaque';
  return mode;
}

const APPLE_PLATFORMS: ReadonlySet<PlatformId> = new Set(['iphone', 'ipad', 'macos', 'watchos']);

export function buildPlan(selected: readonly PlatformId[], opts: GenerateOptions): Plan {
  const layout = LAYOUT_BY_ID.get(opts.layout);
  if (!layout) throw new Error(`Unknown layout: ${opts.layout}`);

  const jobs = new Map<string, RenderJob>();
  const files = new Map<string, PlannedFile>();
  const texts: TextFile[] = [];
  const icos: PlannedIco[] = [];

  /** appiconset path -> specs contributing to it, in selection order. */
  const catalogs = new Map<string, IconSpec[]>();
  /** `.xcassets` roots that need a stub Contents.json. */
  const xcassetsRoots = new Set<string>();

  const addJob = (px: number, mode: RenderMode): string => {
    const id = jobId(px, mode);
    if (!jobs.has(id)) jobs.set(id, { kind: 'icon', id, source: 0, px, mode });
    return id;
  };

  for (const id of selected) {
    const platform = PLATFORM_BY_ID.get(id);
    if (!platform) continue;

    const root = layout.roots[id];
    const isApple = APPLE_PLATFORMS.has(id);

    for (const spec of platform.specs) {
      const mode = effectiveMode(spec, isApple, opts);
      const zipPath = spec.absolutePath ?? `${root}${spec.path}`;
      files.set(zipPath, { zipPath, jobId: addJob(spec.px, mode) });

      if (spec.catalog) {
        const setPath = `${root}${spec.path.slice(0, spec.path.indexOf('/'))}`;
        const bucket = catalogs.get(setPath);
        if (bucket) bucket.push(spec);
        else catalogs.set(setPath, [spec]);
        if (root.endsWith('.xcassets/')) xcassetsRoots.add(root);
      }
    }

    if (platform.extras) {
      for (const extra of platform.extras(opts)) {
        texts.push({ path: `${root}${extra.path}`, contents: extra.contents });
      }
    }

    if (id === 'web') {
      icos.push({
        zipPath: `${root}favicon.ico`,
        members: ICO_SIZES.map((size) => ({ size, jobId: addJob(size, 'contain') })),
      });
    }
  }

  for (const [setPath, specs] of catalogs) {
    texts.push({ path: `${setPath}/Contents.json`, contents: buildContentsJson(specs) });
  }
  for (const root of xcassetsRoots) {
    texts.push({ path: `${root}Contents.json`, contents: buildRootContentsJson() });
  }

  return {
    jobs: [...jobs.values()],
    files: [...files.values()],
    icos,
    texts,
    outputCount: files.size + icos.length + texts.length,
  };
}
