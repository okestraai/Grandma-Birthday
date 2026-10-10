import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/playfair-display/wght-italic.css';
import './styles/index.css';
import { App } from './App';
import { queryClient } from './lib/query';
import { siteQuery } from './lib/public-api';
import { persistPublicQueries, restorePublicSnapshot } from './lib/snapshot';
import { preloadAdmin } from './pages/admin/chunks';
import { startVersionCheck } from './lib/version';
import { reloadOnPreloadError } from './lib/chunk-reload';
import { installDevHeal } from './lib/dev-heal';

// Development only: a tab left on an older Vite bundle reloads once instead of erroring.
installDevHeal();

// Production only: watch for newer deploys (the build stamps its id into index.html), and reload
// once if page code from the old deploy has gone.
const buildId = document.querySelector<HTMLMetaElement>('meta[name="app-build"]')?.content;
if (import.meta.env.PROD) {
  reloadOnPreloadError();
  if (buildId) startVersionCheck(buildId);
}

// Show the last saved public data straight away (refetched at once), and keep saving it.
const path = window.location.pathname;
restorePublicSnapshot(queryClient, path);
persistPublicQueries(queryClient);

// Every page under the public layout needs /api/site. Start it now, alongside the route chunks,
// rather than once the layout has loaded and rendered.
if (!path.startsWith('/admin') && !path.startsWith('/memories/')) void queryClient.prefetchQuery(siteQuery);

// Admin URLs: fetch the layout and page chunks, and the page's data, while the sign-in check runs.
if (path.startsWith('/admin')) preloadAdmin(path, window.location.search);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
