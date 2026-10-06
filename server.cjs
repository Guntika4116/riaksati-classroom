const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
try { process.loadEnvFile(path.join(__dirname, '.env')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const ai = require('./api/ai.js');
const port = Number(process.env.PORT || 5173);
const publicFiles = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/src/app.js', ['src/app.js', 'text/javascript']],
  ['/src/theme.js', ['src/theme.js', 'text/javascript']],
  ['/src/styles.css', ['src/styles.css', 'text/css']]
]);
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { res.writeHead(400); return res.end('Bad request'); }
  if (pathname === '/api/ai') return ai(req, res);
  const asset = publicFiles.get(pathname);
  if (!asset) { res.writeHead(404); return res.end('Not found'); }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end('Method not allowed'); }
  fs.readFile(path.join(__dirname, asset[0]), (error, data) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.on('error', error => { console.error(error.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`Riaksati classroom: http://127.0.0.1:${port}`));
