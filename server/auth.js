// Contas de usuário: login, sessões, convites, recuperação de senha e administração.
import { Router } from 'express';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import { Usuario, TokenAcesso, Sistema, Categoria } from './models.js';
import { semFiltro, comoUsuario, rodarComo } from './tenancy.js';
import { CATEGORIAS_PADRAO } from './padrao.js';
import { enviarEmail, emailConfigurado } from './email.js';

const scrypt = promisify(crypto.scrypt);
const auth = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const erro = (res, status, mensagem, codigo = null, dados) => res.status(status).json({ erro: mensagem, codigo, dados });
const COOKIE = 'mf_sessao';
const DIAS_SESSAO = 30;
const SENHA_APP = process.env.APP_PASSWORD || '';

// ---------- senhas (scrypt com sal) ----------
const N = 16384, R = 8, P = 1, TAM = 64;
export async function gerarHash(senha) {
  const sal = crypto.randomBytes(16);
  const h = await scrypt(String(senha).normalize('NFKC'), sal, TAM, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${h.toString('base64')}`;
}
export async function conferirSenha(senha, guardado) {
  try {
    const [alg, n, r, p, sal, hash] = String(guardado).split('$');
    if (alg !== 'scrypt') return false;
    const esperado = Buffer.from(hash, 'base64');
    const h = await scrypt(String(senha).normalize('NFKC'), Buffer.from(sal, 'base64'), esperado.length, { N: Number(n), r: Number(r), p: Number(p) });
    return crypto.timingSafeEqual(h, esperado);
  } catch { return false; }
}
// hash fixo para gastar o mesmo tempo quando o e-mail não existe (não revela quem tem conta)
let hashFalso = null;
const senhaValida = (s) => typeof s === 'string' && s.length >= 8 && s.length <= 200;
const emailValido = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()) && e.length <= 200;

// ---------- segredo das sessões: APP_SECRET ou gerado uma vez e guardado ----------
let segredo = null;
async function obterSegredo() {
  if (segredo) return segredo;
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 16) return (segredo = process.env.APP_SECRET);
  const s = await Sistema.findOne({ chave: 'segredo-sessao' }).lean();
  if (s?.valor) return (segredo = s.valor);
  const novo = crypto.randomBytes(48).toString('base64url');
  await Sistema.updateOne({ chave: 'segredo-sessao' }, { $setOnInsert: { valor: novo } }, { upsert: true });
  return (segredo = (await Sistema.findOne({ chave: 'segredo-sessao' }).lean()).valor);
}
const assinar = async (dados) => crypto.createHmac('sha256', await obterSegredo()).update(dados).digest('base64url');

async function criarSessao(res, req, usuario) {
  const exp = Date.now() + DIAS_SESSAO * 86400000;
  const dados = Buffer.from(JSON.stringify({ u: String(usuario._id), v: usuario.versaoSessao, e: exp })).toString('base64url');
  const valor = `${dados}.${await assinar(dados)}`;
  res.cookie(COOKIE, valor, { httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/', maxAge: DIAS_SESSAO * 86400000 });
}
const lerCookie = (req) => {
  const m = String(req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : null;
};
/** Usuário da sessão (ou null). Confere assinatura, validade, versão e se a conta está ativa. */
async function usuarioDaSessao(req) {
  const c = lerCookie(req);
  if (!c || !c.includes('.')) return null;
  const [dados, assinatura] = c.split('.');
  const esperado = await assinar(dados);
  if (assinatura.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado))) return null;
  let p;
  try { p = JSON.parse(Buffer.from(dados, 'base64url').toString()); } catch { return null; }
  if (!p?.u || !(p.e > Date.now()) || !mongoose.isValidObjectId(p.u)) return null;
  const u = await Usuario.findById(p.u).lean();
  if (!u || !u.ativo || u.versaoSessao !== p.v) return null;
  return u;
}
const limparSessao = (res, req) => res.clearCookie(COOKIE, { httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/' });
const publico = (u) => ({ _id: u._id, nome: u.nome, email: u.email, admin: u.admin });

// ---------- limite de tentativas (por IP e por e-mail) ----------
const tentativas = new Map();
function limitar(chave, max, janelaMin) {
  const agora = Date.now();
  const t = (tentativas.get(chave) || []).filter((x) => agora - x < janelaMin * 60000);
  tentativas.set(chave, t);
  return { excedeu: t.length >= max, registrar: () => { t.push(agora); tentativas.set(chave, t); }, limpar: () => tentativas.delete(chave) };
}
setInterval(() => { const agora = Date.now(); for (const [k, t] of tentativas) if (!t.some((x) => agora - x < 3600000)) tentativas.delete(k); }, 600000).unref();
const ipDe = (req) => req.ip || req.socket?.remoteAddress || '?';

// ---------- tokens de uso único (convite e senha) ----------
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
async function criarToken(tipo, dados, horas) {
  const token = crypto.randomBytes(32).toString('base64url');
  await TokenAcesso.create({ ...dados, tipo, hash: hashToken(token), expira: new Date(Date.now() + horas * 3600000) });
  return token;
}
async function tokenValido(tipo, token) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const t = await TokenAcesso.findOne({ tipo, hash: hashToken(token) }).lean();
  if (!t || t.usado || t.expira < new Date()) return null;
  return t;
}
/** Endereço público do app (para os links nos e-mails). Nunca vem do pedido em produção. */
function urlApp(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return `${req.protocol}://${req.get('host')}`;
}

/** Conta nova: categorias padrão já criadas */
async function criarUsuario({ nome, email, senha, admin = false }) {
  const u = await Usuario.create({ nome: String(nome).trim().slice(0, 80), email: email.trim().toLowerCase(), senhaHash: await gerarHash(senha), admin });
  await comoUsuario(u._id, () => Categoria.insertMany(CATEGORIAS_PADRAO.map((c) => ({ tipo: 'despesa', ...c }))));
  return u;
}

/** Primeira conta: os dados que já existiam (de antes dos usuários) passam a ser dela */
async function adotarDadosAntigos(usuarioId) {
  const modelos = Object.values(mongoose.models).filter((m) => m.schema.path('usuario') && !['TokenAcesso'].includes(m.modelName));
  for (const m of modelos) {
    const r = await m.collection.updateMany({ $or: [{ usuario: null }, { usuario: { $exists: false } }], ...(m.modelName === 'Config' ? { chave: { $ne: 'vapid' } } : {}) }, { $set: { usuario: new mongoose.Types.ObjectId(String(usuarioId)) } });
    if (r.modifiedCount) console.log(`  ${m.modelName}: ${r.modifiedCount} registros passaram para a primeira conta`);
  }
  // se a conta antiga não tinha categorias, cria as padrão
  if (!(await comoUsuario(usuarioId, () => Categoria.countDocuments()))) await comoUsuario(usuarioId, () => Categoria.insertMany(CATEGORIAS_PADRAO.map((c) => ({ tipo: 'despesa', ...c }))));
}

// ======================= rotas públicas =======================

/** Situação: há contas? quem está logado? o e-mail está configurado? */
auth.get('/status', wrap(async (req, res) => {
  const u = await usuarioDaSessao(req);
  if (u) { await criarSessao(res, req, u); Usuario.updateOne({ _id: u._id }, { ultimoAcesso: new Date() }).catch(() => {}); }
  const temUsuarios = !!(await Usuario.exists({}));
  res.json({ ok: true, temUsuarios, precisaSenhaApp: !temUsuarios && !!SENHA_APP, eu: u ? publico(u) : null, emailConfigurado: emailConfigurado() });
}));

/** Primeira conta (administrador). Se APP_PASSWORD existir, ela é exigida. */
auth.post('/auth/primeiro', wrap(async (req, res) => {
  if (await Usuario.exists({})) return erro(res, 403, 'Já existe uma conta', 'ja_configurado');
  const { nome, email, senha, senhaApp } = req.body || {};
  const lim = limitar(`primeiro|${ipDe(req)}`, 8, 15);
  if (lim.excedeu) return erro(res, 429, 'Muitas tentativas', 'muitas_tentativas');
  if (SENHA_APP) {
    const ok = typeof senhaApp === 'string' && senhaApp.length === SENHA_APP.length && crypto.timingSafeEqual(Buffer.from(senhaApp), Buffer.from(SENHA_APP));
    if (!ok) { lim.registrar(); return erro(res, 401, 'Senha do app incorreta', 'senha_app_incorreta'); }
  }
  if (!nome?.trim() || !emailValido(email)) return erro(res, 400, 'Dados inválidos', 'dados_invalidos');
  if (!senhaValida(senha)) return erro(res, 400, 'Senha curta', 'senha_curta');
  const u = await criarUsuario({ nome, email, senha, admin: true });
  await adotarDadosAntigos(u._id);
  await criarSessao(res, req, u);
  res.status(201).json({ eu: publico(u) });
}));

auth.post('/auth/entrar', wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const senha = String(req.body?.senha || '');
  const porIp = limitar(`ip|${ipDe(req)}`, 20, 15), porEmail = limitar(`email|${email}`, 8, 15);
  if (porIp.excedeu || porEmail.excedeu) return erro(res, 429, 'Muitas tentativas', 'muitas_tentativas');
  const u = await Usuario.findOne({ email }).lean();
  if (!hashFalso) hashFalso = await gerarHash(crypto.randomBytes(16).toString('hex'));
  const ok = await conferirSenha(senha, u?.senhaHash || hashFalso);
  if (!u || !ok || !u.ativo) { porIp.registrar(); porEmail.registrar(); return erro(res, 401, 'E-mail ou senha incorretos', 'login_invalido'); }
  porEmail.limpar();
  await criarSessao(res, req, u);
  res.json({ eu: publico(u) });
}));

auth.post('/auth/sair', (req, res) => { limparSessao(res, req); res.json({ ok: true }); });

auth.get('/auth/convite/:token', wrap(async (req, res) => {
  const t = await tokenValido('convite', req.params.token);
  res.json({ valido: !!t, email: t?.email || '' });
}));

auth.post('/auth/cadastro', wrap(async (req, res) => {
  const lim = limitar(`cadastro|${ipDe(req)}`, 10, 15);
  if (lim.excedeu) return erro(res, 429, 'Muitas tentativas', 'muitas_tentativas');
  lim.registrar();
  const t = await tokenValido('convite', req.body?.token);
  if (!t) return erro(res, 400, 'Convite inválido ou expirado', 'convite_invalido');
  const { nome } = req.body || {};
  const email = String(t.email || req.body?.email || '').trim().toLowerCase();
  if (!nome?.trim() || !emailValido(email)) return erro(res, 400, 'Dados inválidos', 'dados_invalidos');
  if (!senhaValida(req.body?.senha)) return erro(res, 400, 'Senha curta', 'senha_curta');
  if (await Usuario.exists({ email })) return erro(res, 409, 'E-mail já cadastrado', 'email_em_uso');
  // marca o convite como usado antes de criar (evita dois cadastros com o mesmo link)
  const marcado = await TokenAcesso.updateOne({ _id: t._id, usado: null }, { usado: new Date() });
  if (!marcado.modifiedCount) return erro(res, 400, 'Convite inválido ou expirado', 'convite_invalido');
  const u = await criarUsuario({ nome, email, senha: req.body.senha });
  await criarSessao(res, req, u);
  res.status(201).json({ eu: publico(u) });
}));

/** Pede o link de redefinição. A resposta é sempre a mesma (não revela se o e-mail existe). */
auth.post('/auth/esqueci', wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const porIp = limitar(`esqueci-ip|${ipDe(req)}`, 10, 60), porEmail = limitar(`esqueci|${email}`, 3, 60);
  if (porIp.excedeu) return erro(res, 429, 'Muitas tentativas', 'muitas_tentativas');
  porIp.registrar();
  const resposta = { ok: true };
  if (porEmail.excedeu || !emailValido(email)) return res.json(resposta);
  porEmail.registrar();
  const u = await Usuario.findOne({ email, ativo: true }).lean();
  if (u) {
    await TokenAcesso.updateMany({ tipo: 'senha', usuario: u._id, usado: null }, { usado: new Date() }); // só o link mais novo vale
    const token = await criarToken('senha', { usuario: u._id }, 1);
    const link = `${urlApp(req)}/#redefinir=${token}`;
    enviarEmail({
      para: u.email, idioma: String(req.body?.idioma || 'pt'), modelo: 'redefinir', dados: { nome: u.nome, link },
    }).catch((e) => console.error('E-mail de redefinição:', e.message));
  }
  res.json(resposta);
}));

auth.get('/auth/redefinir/:token', wrap(async (req, res) => {
  const t = await tokenValido('senha', req.params.token);
  res.json({ valido: !!t });
}));

auth.post('/auth/redefinir', wrap(async (req, res) => {
  const lim = limitar(`redefinir|${ipDe(req)}`, 10, 15);
  if (lim.excedeu) return erro(res, 429, 'Muitas tentativas', 'muitas_tentativas');
  lim.registrar();
  const t = await tokenValido('senha', req.body?.token);
  if (!t) return erro(res, 400, 'Link inválido ou expirado', 'link_invalido');
  if (!senhaValida(req.body?.senha)) return erro(res, 400, 'Senha curta', 'senha_curta');
  const marcado = await TokenAcesso.updateOne({ _id: t._id, usado: null }, { usado: new Date() });
  if (!marcado.modifiedCount) return erro(res, 400, 'Link inválido ou expirado', 'link_invalido');
  // senha nova derruba as sessões abertas em todos os aparelhos
  const u = await Usuario.findOneAndUpdate({ _id: t.usuario, ativo: true }, { senhaHash: await gerarHash(req.body.senha), $inc: { versaoSessao: 1 } }, { new: true }).lean();
  if (!u) return erro(res, 400, 'Link inválido ou expirado', 'link_invalido');
  tentativas.delete(`email|${u.email}`);
  await criarSessao(res, req, u);
  res.json({ eu: publico(u) });
}));

// ======================= daqui para baixo: precisa estar logado =======================

/** Exige sessão e roda o resto da requisição "como" esse usuário */
export const exigirLogin = (req, res, next) => {
  usuarioDaSessao(req).then((u) => {
    if (!u) return erro(res, 401, 'Não autorizado', 'nao_autorizado');
    req.usuario = u;
    rodarComo(u._id, next);
  }).catch(next);
};
const exigirAdmin = (req, res, next) => (req.usuario?.admin ? next() : erro(res, 403, 'Só o administrador', 'so_admin'));

auth.get('/auth/eu', exigirLogin, (req, res) => res.json(publico(req.usuario)));
auth.put('/auth/eu', exigirLogin, wrap(async (req, res) => {
  const nome = String(req.body?.nome || '').trim();
  if (!nome) return erro(res, 400, 'Dados inválidos', 'dados_invalidos');
  const u = await Usuario.findByIdAndUpdate(req.usuario._id, { nome: nome.slice(0, 80) }, { new: true }).lean();
  res.json(publico(u));
}));
auth.post('/auth/senha', exigirLogin, wrap(async (req, res) => {
  const lim = limitar(`trocar|${req.usuario._id}`, 8, 15);
  if (lim.excedeu) return erro(res, 429, 'Muitas tentativas', 'muitas_tentativas');
  if (!(await conferirSenha(String(req.body?.atual || ''), req.usuario.senhaHash))) { lim.registrar(); return erro(res, 401, 'Senha atual incorreta', 'senha_atual_incorreta'); }
  if (!senhaValida(req.body?.nova)) return erro(res, 400, 'Senha curta', 'senha_curta');
  const u = await Usuario.findByIdAndUpdate(req.usuario._id, { senhaHash: await gerarHash(req.body.nova), $inc: { versaoSessao: 1 } }, { new: true }).lean();
  await criarSessao(res, req, u); // este aparelho continua logado; os outros saem
  res.json({ ok: true });
}));

// ---------- administração ----------
auth.get('/admin/usuarios', exigirLogin, exigirAdmin, wrap(async (_req, res) => {
  const [usuarios, convites] = await Promise.all([
    Usuario.find().sort({ createdAt: 1 }).lean(),
    TokenAcesso.find({ tipo: 'convite', usado: null, expira: { $gt: new Date() } }).sort({ createdAt: -1 }).lean(),
  ]);
  res.json({
    usuarios: usuarios.map((u) => ({ ...publico(u), ativo: u.ativo, ultimoAcesso: u.ultimoAcesso, createdAt: u.createdAt })),
    convites: convites.map((c) => ({ _id: c._id, email: c.email, expira: c.expira, createdAt: c.createdAt })),
    emailConfigurado: emailConfigurado(),
  });
}));
auth.post('/admin/convites', exigirLogin, exigirAdmin, wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (email && !emailValido(email)) return erro(res, 400, 'E-mail inválido', 'dados_invalidos');
  if (email && await Usuario.exists({ email })) return erro(res, 409, 'E-mail já cadastrado', 'email_em_uso');
  const token = await criarToken('convite', { email, criadoPor: req.usuario._id }, 7 * 24);
  const link = `${urlApp(req)}/#convite=${token}`;
  let enviado = false;
  if (email && req.body?.enviar && emailConfigurado()) {
    try { await enviarEmail({ para: email, idioma: String(req.body?.idioma || 'pt'), modelo: 'convite', dados: { de: req.usuario.nome, link } }); enviado = true; }
    catch (e) { console.error('E-mail de convite:', e.message); }
  }
  res.status(201).json({ link, enviado });
}));
auth.delete('/admin/convites/:id', exigirLogin, exigirAdmin, wrap(async (req, res) => {
  if (mongoose.isValidObjectId(req.params.id)) await TokenAcesso.deleteOne({ _id: req.params.id, tipo: 'convite' });
  res.status(204).end();
}));
/** Link de redefinição gerado pelo administrador (para mandar por WhatsApp, por exemplo) */
auth.post('/admin/usuarios/:id/redefinir', exigirLogin, exigirAdmin, wrap(async (req, res) => {
  const u = mongoose.isValidObjectId(req.params.id) ? await Usuario.findById(req.params.id).lean() : null;
  if (!u) return erro(res, 404, 'Não encontrado');
  await TokenAcesso.updateMany({ tipo: 'senha', usuario: u._id, usado: null }, { usado: new Date() });
  const token = await criarToken('senha', { usuario: u._id, criadoPor: req.usuario._id }, 24);
  res.json({ link: `${urlApp(req)}/#redefinir=${token}` });
}));
auth.put('/admin/usuarios/:id', exigirLogin, exigirAdmin, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return erro(res, 400, 'ID inválido');
  if (String(req.params.id) === String(req.usuario._id)) return erro(res, 400, 'Não dá para mudar a própria conta aqui', 'propria_conta');
  const mudar = {};
  if (typeof req.body?.ativo === 'boolean') { mudar.ativo = req.body.ativo; if (!req.body.ativo) mudar.$inc = { versaoSessao: 1 }; }
  if (typeof req.body?.admin === 'boolean') mudar.admin = req.body.admin;
  const u = await Usuario.findByIdAndUpdate(req.params.id, mudar, { new: true }).lean();
  u ? res.json(publico(u)) : erro(res, 404, 'Não encontrado');
}));

/** Ao iniciar: índices novos (únicos por usuário) e sem índices antigos */
export async function prepararBanco() {
  await semFiltro(async () => {
    for (const m of Object.values(mongoose.models)) {
      try { await m.syncIndexes(); } catch (e) { console.warn(`Índices de ${m.modelName}:`, e.message); }
    }
  });
}

export default auth;
