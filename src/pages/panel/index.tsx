import React from 'react';
import { createRoot } from 'react-dom/client';
import Panel from '@pages/panel/Panel';
import '@pages/panel/index.css';
import '@src/globals.css';
import refreshOnUpdate from 'virtual:reload-on-update-in-view';
import { ThemeProvider } from '@root/src/shared/hooks/useTheme';

refreshOnUpdate('pages/panel');

function init() {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = createRoot(appContainer);
  root.render(
    <ThemeProvider>
      <Panel />
    </ThemeProvider>,
  );
}

init();
