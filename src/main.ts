import './style.css';

import { initTabs } from './ui/tabs';
import { initAppIconView } from './ui/appicon-view';
import { initImageSetsView } from './ui/imagesets-view';
import { attachPaste, guardWindowDrops } from './ui/source';

const appIcon = initAppIconView();
const imageSets = initImageSetsView();
const tabs = initTabs();

// One paste listener for the document, routed to whichever view is on screen.
attachPaste((files) => {
  if (tabs.current() === 'imagesets') imageSets.acceptFiles(files);
  else appIcon.acceptFiles(files);
});

guardWindowDrops();
