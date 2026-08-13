import { IPAD, IPHONE, MACOS, WATCHOS } from './apple';
import { ANDROID, ANDROID_ADAPTIVE } from './android';
import { WEB } from './web';
import type { LayoutId, Platform, PlatformId } from './types';

export * from './types';
export { ADAPTIVE_DP } from './android';
export { ICO_SIZES } from './web';

/** Display order in the picker, mirroring the original site. */
export const PLATFORMS: readonly Platform[] = [
  IPHONE,
  IPAD,
  ANDROID,
  ANDROID_ADAPTIVE,
  MACOS,
  WATCHOS,
  WEB,
];

export const PLATFORM_BY_ID: ReadonlyMap<PlatformId, Platform> = new Map(
  PLATFORMS.map((p) => [p.id, p]),
);

export interface Layout {
  readonly id: LayoutId;
  readonly label: string;
  readonly hint: string;
  /** Zip-path prefix per platform. Must end with `/` unless empty. */
  readonly roots: Readonly<Record<PlatformId, string>>;
}

export const LAYOUTS: readonly Layout[] = [
  {
    id: 'standard',
    label: 'Standard',
    hint: 'Plain folders — drag into any project',
    roots: {
      iphone: 'ios/',
      ipad: 'ios/',
      macos: 'macos/',
      watchos: 'watchos/',
      android: 'android/',
      'android-adaptive': 'android/',
      web: 'web/',
    },
  },
  {
    id: 'flutter',
    label: 'Flutter',
    hint: 'Matches the default Flutter project tree',
    roots: {
      iphone: 'ios/Runner/Assets.xcassets/',
      ipad: 'ios/Runner/Assets.xcassets/',
      macos: 'macos/Runner/Assets.xcassets/',
      watchos: 'watchos/Runner/Assets.xcassets/',
      android: 'android/app/src/main/',
      'android-adaptive': 'android/app/src/main/',
      web: 'web/icons/',
    },
  },
  {
    id: 'react-native',
    label: 'React Native',
    hint: 'Matches a bare React Native project tree',
    roots: {
      iphone: 'ios/Images.xcassets/',
      ipad: 'ios/Images.xcassets/',
      macos: 'macos/Images.xcassets/',
      watchos: 'watchos/Images.xcassets/',
      android: 'android/app/src/main/',
      'android-adaptive': 'android/app/src/main/',
      web: 'web/',
    },
  },
];

export const LAYOUT_BY_ID: ReadonlyMap<LayoutId, Layout> = new Map(LAYOUTS.map((l) => [l.id, l]));
