import { ClerkProvider } from '@clerk/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppConfig } from '../shared/api';
import { App } from './App';
import { withRequestTimeout } from './request';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
root.render(
  <div className="boot-screen">
    <img src="/vmedithon-shorten.png" alt="" />
    <h1>VMEDITHON Judging</h1>
    <p>Opening your workspace…</p>
  </div>,
);
// The publishable key comes from the Worker so there is one place to configure it.
withRequestTimeout(async (signal) => {
  const response = await fetch('/api/config', { signal });
  if (!response.ok) throw new Error('The judging API is unavailable.');
  return (await response.json()) as AppConfig;
})
  .then((config) => {
    if (config.clerkPublishableKey)
      root.render(
        <StrictMode>
          <ClerkProvider publishableKey={config.clerkPublishableKey} afterSignOutUrl="/">
            <App />
          </ClerkProvider>
        </StrictMode>,
      );
    else
      throw new Error(
        'Sign-in is not configured yet. Connect this site to Clerk to open your judging workspace.',
      );
  })
  .catch((error) =>
    root.render(
      <div className="boot-screen">
        <img src="/vmedithon-shorten.png" alt="" />
        <h1>VMEDITHON Judging</h1>
        <p role="alert">{error instanceof Error ? error.message : 'Could not open the workspace.'}</p>
        <button className="button secondary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>,
    ),
  );
