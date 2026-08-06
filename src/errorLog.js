// In-game error capture and inspector system

export const capturedErrors = [];
let errorListeners = [];

export function subscribeErrors(fn) {
  errorListeners.push(fn);
  return () => {
    errorListeners = errorListeners.filter(l => l !== fn);
  };
}

function notifyErrorListeners() {
  for (const fn of errorListeners) {
    try { fn(capturedErrors); } catch (e) {}
  }
}

export function logError(err, source = 'Runtime') {
  const timestamp = new Date().toLocaleTimeString();
  let message = 'Unknown error';
  let stack = '';

  if (typeof err === 'string') {
    message = err;
  } else if (err && err.message) {
    message = err.message;
    stack = err.stack || '';
  } else if (err) {
    try { message = JSON.stringify(err); } catch (e) { message = String(err); }
  }

  const errorEntry = {
    id: Date.now() + Math.random(),
    timestamp,
    source,
    message,
    stack,
  };

  // Keep last 30 errors
  capturedErrors.unshift(errorEntry);
  if (capturedErrors.length > 30) capturedErrors.pop();

  notifyErrorListeners();
}

// Global error hooks
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    const src = e.filename ? `${e.filename.split('/').pop()}:${e.lineno}` : 'Global';
    logError(e.error || e.message, src);
  });

  window.addEventListener('unhandledrejection', (e) => {
    logError(e.reason || 'Unhandled Promise Rejection', 'Promise');
  });

  const originalConsoleError = console.error;
  console.error = function(...args) {
    originalConsoleError.apply(console, args);
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    logError(msg, 'console.error');
  };
}

export function clearCapturedErrors() {
  capturedErrors.length = 0;
  notifyErrorListeners();
}
