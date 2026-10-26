// Junta dist-demo/ num único arquivo HTML (para publicar como página independente).
import fs from 'node:fs';
import path from 'node:path';

const dir = 'dist-demo';
const html = fs.readFileSync(path.join(dir, 'demo.html'), 'utf8');
const js = fs.readdirSync(path.join(dir, 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dir, 'assets', f), 'utf8')).join('\n');
const css = fs.readdirSync(path.join(dir, 'assets')).filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(dir, 'assets', f), 'utf8')).join('\n');
const saida = process.argv[2] || 'minhas-financas-demo.html';
const pagina = `<title>Minhas Finanças</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
fs.writeFileSync(saida, pagina);
console.log(`${saida}: ${(pagina.length / 1024).toFixed(0)} KB (${html.length} bytes de html base)`);
