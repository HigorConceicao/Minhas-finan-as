// Separação dos dados por usuário.
// Cada requisição autenticada roda "como" um usuário (AsyncLocalStorage); o plugin abaixo
// filtra toda consulta por esse usuário e o grava em tudo o que é criado.
// Sem usuário no contexto, a consulta falha (nunca devolve dados de todos por engano).
import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose from 'mongoose';

const contexto = new AsyncLocalStorage();

export const usuarioAtual = () => contexto.getStore()?.usuario || null;
/** Roda `fn` como o usuário `id` */
// (o `await` dentro é essencial: consultas do Mongoose só rodam quando aguardadas, e precisam rodar aqui dentro)
export const comoUsuario = (id, fn) => contexto.run({ usuario: String(id) }, async () => await fn());
/** Roda `fn` sem filtro (tarefas do sistema: migração, login, agendador). Use com cuidado. */
export const semFiltro = (fn) => contexto.run({ livre: true }, async () => await fn());
/** Para middlewares do Express */
export const middlewareUsuario = (id) => (_req, _res, next) => contexto.run({ usuario: String(id) }, next);
export const rodarComo = (id, next) => contexto.run({ usuario: String(id) }, next);

const OPERACOES = [
  'find', 'findOne', 'countDocuments', 'count', 'distinct',
  'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany',
  'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
];

function exigir() {
  const s = contexto.getStore();
  if (s?.livre) return null;
  if (!s?.usuario) throw Object.assign(new Error('Acesso a dados sem usuário'), { status: 401, codigo: 'nao_autorizado' });
  return s.usuario;
}

export function pluginUsuario(schema) {
  schema.add({ usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null, index: true } });
  schema.pre(OPERACOES, function () {
    const u = exigir();
    if (u) this.where({ usuario: u });
  });
  schema.pre('save', function () {
    const u = exigir();
    if (u && !this.usuario) this.usuario = u;
    if (u && String(this.usuario) !== u) throw Object.assign(new Error('Usuário diferente'), { status: 403 });
  });
  schema.pre('insertMany', function (next, docs) {
    try {
      const u = exigir();
      if (u) for (const d of Array.isArray(docs) ? docs : [docs]) d.usuario = u;
      next();
    } catch (e) { next(e); }
  });
  schema.pre('aggregate', function () {
    const u = exigir();
    if (u) this.pipeline().unshift({ $match: { usuario: new mongoose.Types.ObjectId(u) } });
  });
}
