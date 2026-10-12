// =====================================================
// Servidor local, sem dependências
// Serve os arquivos do projeto em http://127.0.0.1:8080 para revisar a
// aplicação e rodar os testes automatizados. Bloqueia pastas ocultas
// (como .git) e node_modules. Não é usado na publicação, que é estática.
// Uso: node servidor.js
// =====================================================
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const raiz = __dirname;
const tipos = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json; charset=utf-8', '.pdf':'application/pdf', '.md':'text/plain; charset=utf-8' };
http.createServer((req,res)=> {
  let nome;
  try { nome = decodeURIComponent(new URL(req.url,'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end('Endereço inválido'); }
  if(nome==='/') nome='/index.html';
  const partes=nome.split('/');
  if(partes.some(p=>p.startsWith('.')||p==='node_modules')) {res.writeHead(403);return res.end('Acesso bloqueado');}
  const arquivo=path.resolve(raiz,'.'+nome);
  if(!arquivo.startsWith(raiz+path.sep)) {res.writeHead(403);return res.end('Acesso bloqueado');}
  fs.readFile(arquivo,(erro,dados)=> {
    if(erro) {res.writeHead(404);return res.end('Arquivo não encontrado');}
    res.writeHead(200,{'Content-Type':tipos[path.extname(arquivo)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(dados);
  });
}).listen(8080,'127.0.0.1',()=>console.log('Abra http://127.0.0.1:8080 · Ctrl+C encerra o servidor.'));
