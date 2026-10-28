import express from 'express';
import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import api from './routes.js';
import { Categoria } from './models.js';
import { iniciarLembretes } from './lembretes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const CATEGORIAS_PADRAO = [
  { nome: 'Moradia', icone: '🏠', cor: '#8b5e3c' },
  { nome: 'Mercado', icone: '🛒', cor: '#5f7a4a' },
  { nome: 'Restaurantes', icone: '🍽️', cor: '#b5651d' },
  { nome: 'Transporte', icone: '🚆', cor: '#4a6378' },
  { nome: 'Saúde', icone: '⚕️', cor: '#7a4a5f' },
  { nome: 'Lazer', icone: '🎭', cor: '#9c7a2c' },
  { nome: 'Viagens', icone: '✈️', cor: '#3f7a78' },
  { nome: 'Assinaturas', icone: '🔁', cor: '#6b5b8a' },
  { nome: 'Educação', icone: '📚', cor: '#5a6b3a' },
  { nome: 'Outros', icone: '•', cor: '#7d7468' },
  { nome: 'Salário', icone: '💼', cor: '#2f6b4f', tipo: 'receita' },
  { nome: 'Extras', icone: '✨', cor: '#4f7a2f', tipo: 'receita' },
];

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
  if ((await Categoria.countDocuments()) === 0) {
    await Categoria.insertMany(CATEGORIAS_PADRAO.map((c) => ({ tipo: 'despesa', ...c })));
  }
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
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
