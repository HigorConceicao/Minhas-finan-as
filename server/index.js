import express from 'express';
import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import api from './routes.js';
import auth, { prepararBanco } from './auth.js';
import { iniciarLembretes } from './lembretes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;


async function conectar() {
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    // Desenvolvimento: banco em memória (os dados somem ao reiniciar)
    let MongoMemoryServer;
    try {
      ({ MongoMemoryServer } = await import('mongodb-memory-server'));
    } catch {
      throw new Error('A variável MONGODB_URI não está definida. No Railway: serviço → Variables → New Variable → MONGODB_URI.');
    }
    const mem = await MongoMemoryServer.create();
    uri = mem.getUri();
    console.warn('⚠️  MONGODB_URI não definida — usando banco em memória (dados temporários).');
  }
  await mongoose.connect(uri);
  await prepararBanco(); // índices por usuário (as categorias padrão são criadas com cada conta)
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Railway: HTTPS no proxy (cookies seguros, IP certo para o limite de tentativas)
app.use((_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
  next();
});
app.use(express.json({ limit: '5mb' }));
// pedidos que mudam dados precisam vir como JSON (barra formulários de outros sites)
app.use('/api', (req, res, next) => {
  const temCorpo = Number(req.headers['content-length']) > 0 || !!req.headers['transfer-encoding'];
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && temCorpo && !req.is('application/json')) {
    return res.status(415).json({ erro: 'Use JSON', codigo: 'dados_invalidos' });
  }
  next();
});
app.use('/api', auth);
app.use('/api', api);

// erros da API
app.use('/api', (err, _req, res, _next) => {
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ erro: err.message, codigo: 'dados_invalidos' });
  if (err.status && err.status < 500) return res.status(err.status).json({ erro: err.message, codigo: err.codigo || null, dados: err.dados });
  console.error(err);
  res.status(500).json({ erro: 'Erro interno', codigo: 'erro_interno' });
});

// frontend compilado
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

conectar()
  .then(() => { iniciarLembretes(); app.listen(PORT, () => console.log(`Minhas Finanças v2 rodando na porta ${PORT}`)); })
  .catch((e) => {
    console.error('Falha ao conectar no MongoDB:', e.message);
    process.exit(1);
  });

export default app;
