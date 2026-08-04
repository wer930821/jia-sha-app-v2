const http = require('http');
const fs = require('fs');
const path = require('path');
const nearby = require('./api/nearby');

const root = __dirname;
const port = Number(process.env.PORT || 8000);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/nearby') {
    req.query = Object.fromEntries(url.searchParams.entries());
    return nearby(req, res);
  }
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.normalize(path.join(root, requested));
  if (!filePath.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (error, data) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});
server.listen(port, () => console.log(`呷啥已啟動：http://localhost:${port}`));
