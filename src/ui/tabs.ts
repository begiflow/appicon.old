/**
 * Two-view tab switching, kept in sync with the URL hash.
 *
 * The hash matters: `#image-sets` is the address the original site used, so
 * links to it keep working, and a reload lands the user back where they were.
 */

export type ViewId = 'appicon' | 'imagesets';

const HASH: Readonly<Record<ViewId, string>> = {
  appicon: '#app-icon',
  imagesets: '#image-sets',
};

function viewFromHash(hash: string): ViewId | null {
  const normalised = hash.toLowerCase();
  if (normalised === HASH.imagesets || normalised === '#imagesets') return 'imagesets';
  if (normalised === HASH.appicon || normalised === '#appicon') return 'appicon';
  return null;
}

export interface Tabs {
  current(): ViewId;
}

export function initTabs(onChange?: (view: ViewId) => void): Tabs {
  const bar = document.getElementById('tabs');
  if (!bar) throw new Error('Missing #tabs');

  const buttons = [...bar.querySelectorAll<HTMLButtonElement>('.tab')];
  const views = new Map<ViewId, HTMLElement>();
  for (const id of ['appicon', 'imagesets'] as const) {
    const node = document.getElementById(`view-${id}`);
    if (!node) throw new Error(`Missing #view-${id}`);
    views.set(id, node);
  }

  let current: ViewId = viewFromHash(location.hash) ?? 'appicon';

  const apply = (next: ViewId, updateHash: boolean) => {
    current = next;
    for (const [id, node] of views) node.hidden = id !== next;
    for (const button of buttons) {
      button.setAttribute('aria-selected', String(button.dataset.view === next));
    }
    if (updateHash && viewFromHash(location.hash) !== next) {
      history.replaceState(null, '', HASH[next]);
    }
    onChange?.(next);
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const next = button.dataset.view as ViewId | undefined;
      if (next && next !== current) {
        apply(next, true);
        window.scrollTo({ top: 0 });
      }
    });
  }

  window.addEventListener('hashchange', () => {
    const next = viewFromHash(location.hash);
    if (next && next !== current) apply(next, false);
  });

  apply(current, true);
  return { current: () => current };
}
