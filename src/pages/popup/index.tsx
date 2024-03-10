import React from 'react';
import { createRoot } from 'react-dom/client';
import Popup from '@pages/popup/Popup';
import '@pages/popup/index.css';
import '@src/globals.css';
import refreshOnUpdate from 'virtual:reload-on-update-in-view';
import { ThemeProvider } from '@root/src/shared/hooks/useTheme';

refreshOnUpdate('pages/popup');

function init() {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = createRoot(appContainer);
  root.render(
    <ThemeProvider>
      <Popup />
    </ThemeProvider>,
  );
}

init();
