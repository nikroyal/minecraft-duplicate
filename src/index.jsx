import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

if (window.location.search.includes('simulate=true')) {
  import('./simulator.js').then(m => m.startSimulation());
}
