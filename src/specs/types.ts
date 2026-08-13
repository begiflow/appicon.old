/**
 * Core type definitions for the icon generation pipeline.
 *
 * The whole point of this module is that a malformed `Contents.json` is the #1
 * way an app-icon generator silently produces output Xcode rejects. Every field
 * Apple validates is modelled as a literal union here so a typo is a compile
 * error, not a build-time surprise three days later.
 */

/** Apple asset-catalog `idiom` values relevant to app icons. */
export type AppleIdiom =
  | 'iphone'
  | 'ipad'
  | 'ios-marketing'
  | 'mac'
  | 'watch'
  | 'watch-marketing'
  | 'universal';

/** Apple asset-catalog `scale` values. `1x` is omitted for single-size entries. */
export type AppleScale = '1x' | '2x' | '3x';

/** `role` is required for every `watch` idiom entry. */
export type WatchRole =
  | 'notificationCenter'
  | 'companionSettings'
  | 'appLauncher'
  | 'quickLook';

/** `subtype` is required for `watch` entries whose role is size-dependent. */
export type WatchSubtype = '38mm' | '40mm' | '41mm' | '42mm' | '44mm' | '45mm' | '49mm';

/**
 * How a source image is transformed before being written out.
 *
 * - `contain`   : plain high-quality downscale, alpha preserved.
 * - `opaque`    : downscale then composite over `background`. Required for
 *                 `ios-marketing` — the App Store rejects icons with alpha.
 * - `adaptive-fg`: draw the source inset into the 72dp safe area of a 108dp
 *                 canvas, transparent elsewhere (Android adaptive foreground).
 * - `adaptive-bg`: solid `background` fill, no source pixels (adaptive background).
 * - `circle`    : downscale then clip to a centred circle (Android round icon).
 */
export type RenderMode = 'contain' | 'opaque' | 'adaptive-fg' | 'adaptive-bg' | 'circle';

/** One physical PNG that will end up in the archive. */
export interface IconSpec {
  /** Path inside the zip, *without* any layout prefix. Always POSIX-style. */
  readonly path: string;
  /** Output edge length in pixels. Square only — no app store accepts non-square. */
  readonly px: number;
  /** Defaults to `'contain'`. */
  readonly mode?: RenderMode;
  /**
   * When set, the file is written at exactly this path and the layout prefix is
   * skipped. Used for artefacts that do not belong inside a project tree, e.g.
   * the Google Play listing icon.
   */
  readonly absolutePath?: string;
  /** Asset-catalog metadata. Present only for files inside an `.appiconset`. */
  readonly catalog?: CatalogEntry;
}

/** The subset of a `Contents.json` image entry that we derive per-spec. */
export interface CatalogEntry {
  readonly idiom: AppleIdiom;
  /** Point size as Apple writes it, e.g. `"83.5x83.5"`. */
  readonly size: string;
  readonly scale?: AppleScale;
  readonly role?: WatchRole;
  readonly subtype?: WatchSubtype;
}

/** A user-selectable platform. */
export interface Platform {
  readonly id: PlatformId;
  readonly label: string;
  /** Short blurb shown under the checkbox. */
  readonly hint: string;
  /** Inline SVG path data for the platform glyph. */
  readonly glyph: string;
  /** Recommended default-on state, mirroring the original site. */
  readonly defaultOn: boolean;
  readonly specs: readonly IconSpec[];
  /**
   * Extra non-PNG files (XML, JSON, manifests) contributed by this platform.
   * Evaluated after specs so it can reference the selected options.
   */
  readonly extras?: (opts: GenerateOptions) => readonly TextFile[];
}

export type PlatformId =
  | 'iphone'
  | 'ipad'
  | 'macos'
  | 'watchos'
  | 'android'
  | 'android-adaptive'
  | 'web';

/** A generated text file (Contents.json, AndroidManifest snippets, manifests…). */
export interface TextFile {
  readonly path: string;
  readonly contents: string;
}

/** Folder-structure preset. Only rewrites paths; never changes pixel output. */
export type LayoutId = 'standard' | 'flutter' | 'react-native';

export interface GenerateOptions {
  readonly layout: LayoutId;
  /** CSS hex colour used for `opaque`, `adaptive-bg` and the web manifest. */
  readonly background: string;
  /** App name written into the PWA manifest. */
  readonly appName: string;
  /** Strip alpha from *all* Apple icons, not just `ios-marketing`. */
  readonly forceOpaqueApple: boolean;
}
