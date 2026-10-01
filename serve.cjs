const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, 'dist');
const port = Number(process.argv[2] || 5184);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.glb':'model/gltf-binary','.png':'image/png','.blend':'application/octet-stream','.txt':'text/plain; charset=utf-8'};
http.createServer((request,response)=>{
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url,'http://localhost').pathname); } catch { response.writeHead(400);response.end();return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (file !== root && !file.startsWith(root+path.sep)) { response.writeHead(403);response.end();return; }
  fs.stat(file,(error,stats)=>{
    if(error||!stats.isFile()){response.writeHead(404);response.end('Not found');return;}
    response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Content-Length':stats.size});
    fs.createReadStream(file).pipe(response);
  });
}).listen(port,'127.0.0.1',()=>console.log(`小尺工作室已启动：http://127.0.0.1:${port}/`));
