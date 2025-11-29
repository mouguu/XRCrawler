import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

declare global {
  interface Window {
    __APP_CONFIG__?: {
      apiBase?: string;
    };
  }
}

const apiBase =
  import.meta.env.VITE_API_BASE_URL ||
  window.__APP_CONFIG__?.apiBase ||
  '';

window.__APP_CONFIG__ = {
  ...window.__APP_CONFIG__,
  apiBase,
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
