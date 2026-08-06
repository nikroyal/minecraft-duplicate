// Comprehensive In-Game Error, Telemetry & Console Logging System

export const capturedLogs = [];
export const capturedErrors = capturedLogs;
let logListeners = [];

export function subscribeLogs(fn) {
  logListeners.push(fn);
  return () => {
    logListeners = logListeners.filter(l => l !== fn);
  };
}
export const subscribeErrors = subscribeLogs;

function notifyLogListeners() {
  for (const fn of logListeners) {
    try { fn(capturedLogs); } catch (e) {}
  }
}

export function addLogEntry(type, message, source = 'System', details = null) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = {
    id: Date.now() + Math.random(),
    timestamp,
    type, // 'error' | 'warn' | 'info' | 'network' | 'telemetry'
    source,
    message: typeof message === 'string' ? message : String(message),
    details: details ? (typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details)) : null,
  };

  capturedLogs.unshift(entry);
  if (capturedLogs.length > 100) capturedLogs.pop();
  notifyLogListeners();
}

export function logError(err, source = 'Runtime') {
  let message = 'Unknown error';
  let details = '';

  if (typeof err === 'string') {
    message = err;
  } else if (err && err.message) {
    message = err.message;
    details = err.stack || '';
  } else if (err) {
    try { message = JSON.stringify(err); } catch (e) { message = String(err); }
  }

  addLogEntry('error', message, source, details);
}

export function getSystemTelemetry() {
  if (typeof window === 'undefined') return {};
  const mem = performance && performance.memory ? {
    totalJSHeapSize: `${Math.round(performance.memory.totalJSHeapSize / 1048576)} MB`,
    usedJSHeapSize: `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB`,
    jsHeapSizeLimit: `${Math.round(performance.memory.jsHeapSizeLimit / 1048576)} MB`,
  } : 'N/A';

  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    online: navigator.onLine,
    screenWidth: window.screen ? window.screen.width : 0,
    screenHeight: window.screen ? window.screen.height : 0,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    memory: mem,
    time: new Date().toISOString(),
  };
}

// ── Global Hooks Interceptors ─────────────────────────────────────────
if (typeof window !== 'undefined') {
  // 1. Uncaught Runtime Errors
  window.addEventListener('error', (e) => {
    if (e.target && (e.target.tagName === 'IMG' || e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK' || e.target.tagName === 'AUDIO')) {
      const src = e.target.src || e.target.href || 'Resource';
      addLogEntry('network', `Asset load failed: ${e.target.tagName} (${src})`, 'AssetLoader');
      return;
    }
    const src = e.filename ? `${e.filename.split('/').pop()}:${e.lineno}:${e.colno}` : 'Global';
    logError(e.error || e.message, src);
  }, true);

  // 2. Unhandled Promise Rejections
  window.addEventListener('unhandledrejection', (e) => {
    logError(e.reason || 'Unhandled Promise Rejection', 'Promise');
  });

  // 3. WebGL Context Loss Telemetry
  window.addEventListener('webglcontextlost', (e) => {
    addLogEntry('error', 'WebGL Context Lost! Canvas rendering paused.', 'WebGL');
  });
  window.addEventListener('webglcontextrestored', (e) => {
    addLogEntry('info', 'WebGL Context Restored successfully.', 'WebGL');
  });

  // 4. Console Overrides (Captures error, warn, info, log)
  const origError = console.error;
  console.error = function(...args) {
    origError.apply(console, args);
    const msg = args.map(a => (typeof a === 'object' ? (a.message || JSON.stringify(a)) : String(a))).join(' ');
    addLogEntry('error', msg, 'console.error');
  };

  const origWarn = console.warn;
  console.warn = function(...args) {
    origWarn.apply(console, args);
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    addLogEntry('warn', msg, 'console.warn');
  };

  const origInfo = console.info;
  console.info = function(...args) {
    origInfo.apply(console, args);
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    addLogEntry('info', msg, 'console.info');
  };

  // 5. Network Fetch Interceptor Telemetry
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = async function(...args) {
      const start = performance.now();
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || 'API');
      try {
        const response = await origFetch.apply(this, args);
        const duration = Math.round(performance.now() - start);
        if (!response.ok) {
          addLogEntry('network', `HTTP ${response.status} ${response.statusText} -> ${url} (${duration}ms)`, 'Fetch');
        }
        return response;
      } catch (err) {
        const duration = Math.round(performance.now() - start);
        addLogEntry('network', `Network Fetch Failed -> ${url} (${duration}ms): ${err.message}`, 'Fetch');
        throw err;
      }
    };
  }

  // Log Initial System Telemetry Snapshot
  setTimeout(() => {
    addLogEntry('telemetry', 'Game Environment Telemetry Initialized', 'Telemetry', getSystemTelemetry());
  }, 1000);
}

export function clearCapturedLogs() {
  capturedLogs.length = 0;
  notifyLogListeners();
}
