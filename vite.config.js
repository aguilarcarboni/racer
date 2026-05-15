import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'client-log-bridge',
      configureServer(server) {
        server.middlewares.use('/__client-log', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          let raw = '';
          req.on('data', (chunk) => {
            raw += chunk;
          });

          req.on('end', () => {
            try {
              const data = JSON.parse(raw || '{}');
              const level = data.level || 'log';
              const ts = data.ts || new Date().toISOString();
              const args = Array.isArray(data.args) ? data.args : [data.args];
              const header = `[browser:${level}] ${ts}`;

              if (level === 'error') {
                console.error(header, ...args);
              } else if (level === 'warn') {
                console.warn(header, ...args);
              } else if (level === 'info') {
                console.info(header, ...args);
              } else if (level === 'debug') {
                console.debug(header, ...args);
              } else {
                console.log(header, ...args);
              }
            } catch (error) {
              console.error('[browser:bridge:parse-error]', error);
              console.error('[browser:bridge:raw]', raw);
            }

            res.statusCode = 204;
            res.end();
          });
        });
      },
    },
  ],
});
