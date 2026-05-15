function safeSerialize(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === 'bigint') return value.toString();

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function sendToTerminal(level, args) {
  const payload = {
    level,
    ts: new Date().toISOString(),
    args: args.map(safeSerialize),
  };

  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon('/__client-log', blob);
    return;
  }

  fetch('/__client-log', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function installTerminalLogger() {
  if (!import.meta.env.DEV) return;
  if (window.__terminalLoggerInstalled) return;
  window.__terminalLoggerInstalled = true;

  const levels = ['log', 'info', 'warn', 'error', 'debug'];

  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      sendToTerminal(level, args);
    };
  }

  window.addEventListener('error', (event) => {
    sendToTerminal('error', [
      '[window:error]',
      {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: safeSerialize(event.error),
      },
    ]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    sendToTerminal('error', [
      '[window:unhandledrejection]',
      safeSerialize(event.reason),
    ]);
  });

  console.info('[TerminalLogger] Browser logs are mirrored to Vite terminal');
}
