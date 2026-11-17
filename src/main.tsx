import {createRoot} from 'react-dom/client';
import {canonicalPageUrl} from './client/pageOrigin';
import App from './App.tsx';
import './index.css';
import {I18nProvider} from './utils/i18n.tsx';

const canonical = canonicalPageUrl(window.location.href);
if (canonical) {
  window.location.replace(canonical);
} else {
  createRoot(document.getElementById('root')!).render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
}
