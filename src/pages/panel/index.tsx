import React from 'react';
import { createRoot } from 'react-dom/client';
import PostMessages from '@root/src/pages/panel/PostMessages';
import '@pages/panel/index.css';
import '@src/globals.css';
import refreshOnUpdate from 'virtual:reload-on-update-in-view';
import { ThemeProvider } from '@root/src/shared/hooks/useTheme';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import ListenerMessages from '@root/src/pages/panel/ListenerMessages';
import Findings from '@root/src/pages/panel/Findings';

refreshOnUpdate('pages/panel');

const router = createBrowserRouter(
  [
    {
      path: '/index.html',
      loader: () => ({ message: 'Loading...!' }),
      element: <PostMessages />,
    },
    {
      path: '/listeners',
      loader: () => ({ message: 'Loading...!' }),
      element: <ListenerMessages />,
    },
    {
      path: '/findings',
      loader: () => ({ message: 'Loading...!' }),
      element: <Findings />,
    },
    {
      path: '*',
      loader: () => ({ message: 'Loading...!' }),
      element: <PostMessages />,
    },
  ],
  { basename: '/src/pages/panel/' },
);

function init() {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = createRoot(appContainer);
  root.render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}

init();
