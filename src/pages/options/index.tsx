import React from 'react';
import { createRoot } from 'react-dom/client';
import Options from '@pages/options/Options';
import '@pages/options/index.css';
import '@src/globals.css';
import refreshOnUpdate from 'virtual:reload-on-update-in-view';
import { ThemeProvider } from '@root/src/shared/hooks/useTheme';

refreshOnUpdate('pages/options');

function init() {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = createRoot(appContainer);
  root.render(
    <ThemeProvider>
      <Options />
    </ThemeProvider>,
  );
}

init();
