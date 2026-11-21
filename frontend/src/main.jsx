import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/index.css';
import './styles/settings.css';
import { applyA11y, loadA11y } from './lib/a11y.js';
import App from './App.jsx';
import './i18n';
import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/600.css';
import '@fontsource/noto-sans-bengali/700.css';
applyA11y(loadA11y()); // text size and reduced motion are in place before the first paint
createRoot(document.getElementById('root')).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>);
