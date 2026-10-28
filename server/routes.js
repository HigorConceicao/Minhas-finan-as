import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import {
  Categoria, Lancamento, Recorrente, ContaRendimento, Movimento, Meta, ContribuicaoMeta, RegraCategoria, Conta, Viagem, ReservaViagem, Config,
} from './models.js';
import {
  saldoConta, resumoCartao, faturasCartao, gerarParcelas, patrimonio, seriePatrimonio, resumoViagem, relatorioAnual, lembretes, movimentosSeparados, guardadoNoMes, depositosAutomaticosDevidos, separadoViagensNoMes, sincronizarRegraSalario,
} from './contas.js';
import { chavePublica, inscrever, cancelarInscricao, enviarTeste } from './lembretes.js';
import {
  metricasConta, competenciasDevidas, diaNoMes, mesDe, round2, saldoAte, taxaMensal, ultimoDiaDoMes, rendimentosAutomaticos, metricasMeta, SAIDAS,
} from './finance.js';
import { obterTaxas, converter, conversorPorDia, taxasNaData } from './cambio.js';
import { lerTransacaoAtalho, categoriaDoComerciante, contaDoCartao } from './applepay.js';
import { chaveRegra } from '../src/importacao.js';

const api = Router();

// ---------- utilidades ----------
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const validarId = (id) => mongoose.isValidObjectId(id);
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const intervaloDoMes = (mes) => {
  const [y, m] = mes.split('-').map(Number);
  return { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) };
};
// `codigo` permite ao app mostrar a mensagem no idioma escolhido
const erro = (res, status, mensagem, codigo = null, dados = undefined) => res.status(status).json({ erro: mensagem, codigo, dados });

// ---------- autenticação simples por senha (APP_PASSWORD) ----------
const SENHA = process.env.APP_PASSWORD || '';
const SEGREDO = process.env.APP_SECRET || SENHA || 'dev';
const tokenEsperado = () => crypto.createHmac('sha256', SEGREDO).update(`mf2:${SENHA}`).digest('hex');

api.post('/login', (req, res) => {
  if (!SENHA) return res.json({ token: 'aberto', protegido: false });
  const enviado = String(req.body?.senha || '');
  const ok = enviado.length === SENHA.length && crypto.timingSafeEqual(Buffer.from(enviado), Buffer.from(SENHA));
  if (!ok) return erro(res, 401, 'Senha incorreta', 'senha_incorreta');
  res.json({ token: tokenEsperado(), protegido: true });
});

api.get('/status', (_req, res) => res.json({ ok: true, protegido: Boolean(SENHA) }));

// ---------- Apple Pay: a automação do Atalhos manda cada compra para cá (com a chave própria) ----------
const lerConfigAtalho = async () => (await Config.findOne({ chave: 'atalho' }).lean())?.valor || {};
const gravarConfigAtalho = (valor) => Config.updateOne({ chave: 'atalho' }, { $set: { valor } }, { upsert: true });
api.post('/atalho/lancamento', wrap(async (req, res) => {
  const cfg = await lerConfigAtalho();
  const enviada = String(req.headers['x-chave'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.chave || '').trim();
  const ok = cfg.chave && enviada.length === cfg.chave.length && crypto.timingSafeEqual(Buffer.from(enviada), Buffer.from(cfg.chave));
  if (!ok) return erro(res, 401, 'Chave do atalho inválida', 'chave_atalho');
  const tr = lerTransacaoAtalho(req.body || {});
  const registrar = async (item) => { cfg.ultimos = [{ quando: new Date(), ...item }, ...(cfg.ultimos || [])].slice(0, 10); await gravarConfigAtalho(cfg); };
  if (tr.erro) { await registrar({ ok: false, erro: tr.erro, recebido: JSON.stringify(req.body || {}).slice(0, 200) }); return erro(res, 400, 'Valor não reconhecido', 'valor_invalido'); }
  // cartão novo: aparece nos Ajustes para você ligar a uma conta
  cfg.cartoes = cfg.cartoes || {};
  if (tr.cartao && !(tr.cartao in cfg.cartoes)) cfg.cartoes[tr.cartao] = null;
  const contaId = contaDoCartao(tr.cartao, cfg);
  const conta = contaId && validarId(contaId) ? await Conta.findById(contaId).lean() : null;
  const descricao = tr.comerciante || tr.cartao || 'Apple Pay';
  const moeda = tr.moeda || conta?.moeda || 'EUR';
  // o Atalhos às vezes dispara duas vezes: ignora a mesma compra em até 3 minutos
  const dup = await Lancamento.findOne({ origem: 'applepay', descricao, valor: tr.valor, data: { $gte: new Date(Date.now() - 180000) } }).lean();
  if (dup) { await registrar({ ok: true, duplicado: true, descricao, valor: tr.valor, moeda }); return res.json({ ok: true, duplicado: true, texto: `${descricao}: já registrado` }); }
  const [categorias, regras, historico] = await Promise.all([
    Categoria.find().lean(), RegraCategoria.find().lean(),
    Lancamento.find({ tipo: 'despesa', categoria: { $ne: null } }, 'descricao categoria data tipo').sort({ data: -1 }).limit(500).lean(),
  ]);
  const categoria = categoriaDoComerciante(descricao, { categorias, regras, historico });
  const dados = {
    tipo: tr.estorno ? 'receita' : 'despesa', descricao, valor: tr.valor, moeda, data: new Date(), categoria: tr.estorno ? null : categoria,
    conta: conta?._id || null, origem: 'applepay', revisar: true, nota: tr.moedaOutra ? `${tr.valorTexto} (${tr.moedaOutra})` : '',
  };
  await definirValorConta([dados]);
  const l = await Lancamento.create(dados);
  const cat = categorias.find((c) => String(c._id) === String(categoria));
  await registrar({ ok: true, descricao, valor: tr.valor, moeda, categoria: cat?.nome || null, lancamento: l._id });
  // texto curto que o Atalhos pode mostrar numa notificação
  res.status(201).json({ ok: true, texto: `${tr.valor.toFixed(2)} ${moeda} · ${descricao}${cat ? ` → ${cat.nome}` : ''}` });
}));

api.use((req, res, next) => {
  if (!SENHA) return next();
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (t && t.length === 64 && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(tokenEsperado()))) return next();
  erro(res, 401, 'Não autorizado', 'nao_autorizado');
});

// ---------- recorrentes: gera os lançamentos devidos ----------
export async function gerarRecorrentes(hoje = new Date()) {
  const recs = await Recorrente.find({ ativo: true }).lean();
  let criados = 0;
  for (const rec of recs) {
    const devidas = competenciasDevidas(rec, hoje).filter((m) => !rec.ignoradas?.includes(m));
    if (!devidas.length) continue;
    const existentes = new Set(
      (await Lancamento.find({ recorrente: rec._id, competencia: { $in: devidas } }, 'competencia').lean()).map((l) => l.competencia)
    );
    const novos = devidas
      .filter((m) => !existentes.has(m))
      .map((m) => ({
        tipo: rec.tipo, descricao: rec.descricao, valor: rec.valor, moeda: rec.moeda, categoria: rec.categoria, conta: rec.conta || null,
        data: diaNoMes(m, rec.diaDoMes), recorrente: rec._id, competencia: m,
      }));
    if (novos.length) {
      try {
        const r = await Lancamento.insertMany(novos, { ordered: false });
        criados += r.length;
      } catch (e) {
        if (e.code !== 11000 && !e.writeErrors) throw e; // duplicado em corrida: ignora
      }
    }
  }
  await gerarDepositosAutomaticos(hoje);
  return criados;
}

/** Depósitos automáticos mensais nas metas/poupança (como as recorrências, um por mês) */
let gerandoDepositos = null;
async function gerarDepositosAutomaticos(hoje = new Date()) {
  if (gerandoDepositos) return gerandoDepositos; // evita duplicar com requisições ao mesmo tempo
  gerandoDepositos = (async () => {
    const metas = await Meta.find({ 'mensal.valor': { $gt: 0 }, arquivada: false }).lean();
    for (const meta of metas) {
      const existentes = await ContribuicaoMeta.find({ meta: meta._id, automatica: true }, 'automatica competencia').lean();
      for (const d of depositosAutomaticosDevidos(meta, existentes, hoje)) {
        let conta = null;
        if (d.conta) conta = await Conta.findById(d.conta).lean();
        if (conta && (conta.arquivada || !ORIGENS.includes(conta.tipo))) conta = null;
        await ContribuicaoMeta.create({ ...d, conta: conta?._id || null, valorConta: await valorNaMoedaDaConta(conta, d.valor, meta.moeda, null, d.data), nota: '' });
      }
    }
    // distribuição do salário
    for (const meta of await Meta.find({ 'regraSalario.ativo': true, arquivada: false }).lean()) {
      const r = meta.regraSalario;
      const salarios = await Lancamento.find({ tipo: 'receita', categoria: r.categoria, data: { $gte: new Date(new Date(r.desde).getTime() - 86400000) } }).lean();
      const existentes = await ContribuicaoMeta.find({ meta: meta._id, salario: { $ne: null } }).lean();
      const { taxas } = await obterTaxas();
      const { criar, atualizar, apagar } = sincronizarRegraSalario(meta, salarios, existentes, (v, m) => converter(v, m, meta.moeda, taxas));
      let conta = r.conta ? await Conta.findById(r.conta).lean() : null;
      if (conta && (conta.arquivada || !ORIGENS.includes(conta.tipo))) conta = null;
      for (const c of criar) {
        await ContribuicaoMeta.create({ meta: meta._id, valor: c.valor, data: c.data, salario: c.salario, conta: conta?._id || null,
          valorConta: await valorNaMoedaDaConta(conta, c.valor, meta.moeda, null, c.data), nota: '', pessoa: '' });
      }
      for (const c of atualizar) {
        await ContribuicaoMeta.updateOne({ _id: c._id }, { valor: c.valor, data: c.data, valorConta: await valorNaMoedaDaConta(conta, c.valor, meta.moeda, null, c.data) });
      }
      if (apagar.length) await ContribuicaoMeta.deleteMany({ _id: { $in: apagar } });
    }
  })().finally(() => { gerandoDepositos = null; });
  return gerandoDepositos;
}

/** A poupança existe sempre (é criada na primeira vez) */
async function garantirPoupanca() {
  if (await Meta.exists({ tipo: 'poupanca' })) return;
  await Meta.create({ nome: 'Poupança', icone: '🐷', cor: '#0d8c54', valorAlvo: 0, moeda: 'EUR', tipo: 'poupanca' });
}

// ---------- gasto pago com dinheiro guardado (poupança ou meta) ----------
const erroStatus = (status, msg, codigo, dados) => Object.assign(new Error(msg), { status, codigo, dados });
async function valorNaMeta(l, meta) {
  if (l.moeda === meta.moeda) return round2(Number(l.valor));
  return round2(converter(Number(l.valor), l.moeda, meta.moeda, await taxasNaData(new Date(l.data || Date.now()).toISOString().slice(0, 10))));
}
/** Confere se há dinheiro guardado suficiente (sem contar a retirada já ligada a este lançamento) */
async function validarRetirada(l) {
  if (l.tipo !== 'despesa' || !l.meta) return;
  const meta = await Meta.findById(l.meta).lean();
  if (!meta) throw erroStatus(404, 'Meta não encontrada', 'dados_invalidos');
  const v = await valorNaMeta(l, meta);
  const contribs = await ContribuicaoMeta.find({ meta: meta._id, ...(l._id ? { lancamento: { $ne: l._id } } : {}) }).lean();
  const guardado = round2(contribs.reduce((s, c) => s + Number(c.valor), 0));
  if (v > guardado + 0.004) throw erroStatus(400, 'Retirada maior que o guardado', 'retirada_maior_guardado', { saldo: guardado, moeda: meta.moeda });
}
/** Cria, atualiza ou apaga a retirada ligada ao lançamento */
async function sincronizarRetirada(l) {
  const ligada = await ContribuicaoMeta.findOne({ lancamento: l._id }).lean();
  const meta = l.tipo === 'despesa' && l.meta && !l.parcela?.grupo ? await Meta.findById(l.meta).lean() : null;
  if (!meta) { if (ligada) await ContribuicaoMeta.deleteOne({ _id: ligada._id }); return; }
  const v = await valorNaMeta(l, meta);
  // o dinheiro volta para uma conta só se o guardado tinha saído de uma conta
  const outras = await ContribuicaoMeta.find({ meta: meta._id, lancamento: { $ne: l._id } }).sort({ data: -1 }).lean();
  const emConta = outras.filter((c) => c.conta).reduce((s, c) => s + Number(c.valor), 0);
  let conta = null;
  if (emConta >= v - 0.004) {
    const daCompra = l.conta ? await Conta.findById(l.conta).lean() : null;
    conta = daCompra && ORIGENS.includes(daCompra.tipo) ? daCompra : await Conta.findById(outras.find((c) => c.conta && c.valor > 0)?.conta).lean();
  }
  const dados = { meta: meta._id, valor: -v, data: l.data, conta: conta?._id || null, valorConta: await valorNaMoedaDaConta(conta, -v, meta.moeda, null, l.data), nota: l.descricao, lancamento: l._id, pessoa: '' };
  if (ligada) await ContribuicaoMeta.updateOne({ _id: ligada._id }, dados);
  else await ContribuicaoMeta.create(dados);
}

// ---------- rendimento automático: lança os juros dos meses encerrados ----------
export async function sincronizarRendimentos(conta, hoje = new Date()) {
  if (!conta.rendimentoAutomatico) return 0;
  const movs = await Movimento.find({ conta: conta._id }).lean();
  const novos = rendimentosAutomaticos(conta, movs, hoje);
  if (novos.length) await Movimento.insertMany(novos);
  return novos.length;
}
const sincronizarTodas = async () => {
  for (const c of await ContaRendimento.find({ rendimentoAutomatico: true }).lean()) await sincronizarRendimentos(c);
};

// ---------- câmbio ----------
api.get('/cambio', wrap(async (_req, res) => res.json(await obterTaxas())));

// ---------- categorias ----------
const camposCategoria = ({ nome, tipo, cor, icone, orcamentoMensal, moeda, alertaPct, dedutivel }) =>
  Object.fromEntries(Object.entries({ nome, tipo, cor, icone, orcamentoMensal, moeda, alertaPct, dedutivel }).filter(([, v]) => v !== undefined));

api.get('/categorias', wrap(async (_req, res) => res.json(await Categoria.find().sort({ tipo: 1, nome: 1 }))));
api.post('/categorias', wrap(async (req, res) => res.status(201).json(await Categoria.create(camposCategoria(req.body)))));
api.put('/categorias/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const c = await Categoria.findByIdAndUpdate(req.params.id, camposCategoria(req.body), { new: true, runValidators: true });
  c ? res.json(c) : erro(res, 404, 'Categoria não encontrada');
}));
api.delete('/categorias/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  await Lancamento.updateMany({ categoria: req.params.id }, { categoria: null });
  await Recorrente.updateMany({ categoria: req.params.id }, { categoria: null });
  await RegraCategoria.deleteMany({ categoria: req.params.id });
  await Categoria.findByIdAndDelete(req.params.id);
  res.status(204).end();
}));

// ---------- lançamentos ----------
const idOuNulo = (v) => (v === undefined ? undefined : v && validarId(v) ? v : null);
const camposLancamento = ({ tipo, descricao, valor, moeda, data, categoria, nota, conta, contaDestino, valorDestino, valorConta, fatura, ajuste, viagem, reservaViagem, meta }) => {
  const d = Object.fromEntries(Object.entries({
    tipo, descricao, valor: valor === undefined ? undefined : round2(valor), moeda, data, categoria: idOuNulo(categoria), nota,
    conta: idOuNulo(conta), contaDestino: idOuNulo(contaDestino), viagem: idOuNulo(viagem), meta: idOuNulo(meta),
    valorDestino: valorDestino === undefined ? undefined : valorDestino === null || valorDestino === '' ? null : round2(valorDestino),
    valorConta: valorConta === undefined ? undefined : valorConta === null || valorConta === '' ? null : round2(valorConta),
    fatura: fatura === undefined ? undefined : fatura || null, ajuste, reservaViagem: reservaViagem === undefined ? undefined : !!reservaViagem,
  }).filter(([, v]) => v !== undefined));
  if (d.tipo === 'transferencia') { d.categoria = null; d.viagem = null; d.valorConta = null; d.reservaViagem = false; }
  else if (d.tipo) { d.contaDestino = null; d.valorDestino = null; d.fatura = null; }
  if (d.reservaViagem) d.conta = null; // pago com o dinheiro separado da viagem
  if (d.tipo && d.tipo !== 'despesa') d.meta = null; // só gasto sai da poupança
  return d;
};
/** Compra em moeda diferente da conta: sem valor informado, converte pelo câmbio do dia da compra */
async function definirValorConta(docs) {
  const cache = new Map();
  for (const d of docs) {
    if (d.tipo === 'transferencia' || !d.moeda) continue;
    if (!d.conta && !(d.reservaViagem && d.viagem)) { d.valorConta = null; continue; }
    // gasto com dinheiro separado: o "valor na conta" é na moeda da viagem
    const k = d.reservaViagem ? `v${d.viagem}` : String(d.conta);
    if (!cache.has(k)) cache.set(k, d.reservaViagem ? (await Viagem.findById(String(d.viagem), 'moeda').lean())?.moeda || null : (await Conta.findById(k, 'moeda').lean())?.moeda || null);
    const mc = cache.get(k);
    if (!mc || mc === d.moeda) { d.valorConta = null; continue; }
    if (d.valorConta != null) continue;
    const dia = new Date(d.data || Date.now()).toISOString().slice(0, 10);
    d.valorConta = round2(converter(Number(d.valor), d.moeda, mc, await taxasNaData(dia)));
  }
  return docs;
}
const validarTransferencia = (d) => d.tipo !== 'transferencia' || (d.conta && d.contaDestino && String(d.conta) !== String(d.contaDestino));

api.get('/lancamentos', wrap(async (req, res) => {
  await gerarRecorrentes();
  const filtro = {};
  if (req.query.mes) {
    if (!MES_RE.test(req.query.mes)) return erro(res, 400, 'Mês inválido (use AAAA-MM)');
    filtro.data = intervaloDoMes(req.query.mes);
  }
  if (req.query.categoria && validarId(req.query.categoria)) filtro.categoria = req.query.categoria;
  if (req.query.conta && validarId(req.query.conta)) filtro.$or = [{ conta: req.query.conta }, { contaDestino: req.query.conta }];
  if (req.query.viagem && validarId(req.query.viagem)) filtro.viagem = req.query.viagem;
  if (req.query.revisar === '1') filtro.revisar = true;
  const lista = await Lancamento.find(filtro).sort({ data: -1, createdAt: -1 }).limit(2000).lean();
  if (filtro.$or) {
    // na conta, também o que foi separado para metas e viagens
    const { lancamentos } = await separados();
    const id = String(req.query.conta);
    const mes = req.query.mes;
    lista.push(...lancamentos.filter((l) => (String(l.conta) === id || String(l.contaDestino) === id) && (!mes || mesDe(l.data) === mes)));
    lista.sort((a, b) => new Date(b.data) - new Date(a.data));
  }
  res.json(lista);
}));
api.post('/lancamentos', wrap(async (req, res) => {
  const dados = camposLancamento(req.body);
  if (!validarTransferencia(dados)) return erro(res, 400, 'Escolha as duas contas da transferência', 'transferencia_contas');
  const parcelas = Math.floor(Number(req.body?.parcelas) || 1);
  if (parcelas > 1 && dados.tipo === 'despesa') {
    dados.meta = null; // parcelado não sai da poupança
    await definirValorConta([dados]);
    const docs = gerarParcelas({ ...dados, data: new Date(dados.data).toISOString() }, parcelas, crypto.randomUUID());
    const criados = await Lancamento.insertMany(docs);
    return res.status(201).json(criados[0]);
  }
  await definirValorConta([dados]);
  await validarRetirada(dados);
  const l = await Lancamento.create(dados);
  await sincronizarRetirada(l.toObject());
  if (l.tipo === 'receita') await gerarDepositosAutomaticos(); // salário: distribuição
  res.status(201).json(l);
}));
api.put('/lancamentos/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const dados = camposLancamento(req.body);
  if (!validarTransferencia(dados)) return erro(res, 400, 'Escolha as duas contas da transferência', 'transferencia_contas');
  if (dados.conta !== undefined || dados.valor !== undefined || dados.moeda !== undefined || dados.reservaViagem !== undefined || dados.viagem !== undefined) {
    const atual = await Lancamento.findById(req.params.id).lean();
    if (atual) { const junto = { ...atual, ...dados }; await definirValorConta([junto]); dados.valorConta = junto.valorConta ?? null; }
  }
  const antes = await Lancamento.findById(req.params.id).lean();
  if (!antes) return erro(res, 404, 'Lançamento não encontrado');
  await validarRetirada({ ...antes, ...dados });
  dados.revisar = false; // editado = conferido
  // corrigiu a categoria de uma compra do Apple Pay: aprende para a próxima vez
  if (antes.origem === 'applepay' && dados.categoria && String(dados.categoria) !== String(antes.categoria)) {
    const texto = chaveRegra(dados.descricao || antes.descricao);
    if (texto.length >= 3) await RegraCategoria.updateOne({ texto }, { $set: { categoria: dados.categoria } }, { upsert: true });
  }
  const l = await Lancamento.findByIdAndUpdate(req.params.id, dados, { new: true, runValidators: true });
  await sincronizarRetirada(l.toObject());
  if (l.tipo === 'receita' || antes.tipo === 'receita') await gerarDepositosAutomaticos();
  res.json(l);
}));
api.post('/lancamentos/:id/conferir', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  await Lancamento.updateOne({ _id: req.params.id }, { revisar: false });
  res.json({ ok: true });
}));
// configuração do Apple Pay (só com a senha do app)
api.get('/atalho', wrap(async (_req, res) => {
  const cfg = await lerConfigAtalho();
  res.json({ ativo: !!cfg.chave, chave: cfg.chave || null, conta: cfg.conta || null, cartoes: cfg.cartoes || {}, ultimos: cfg.ultimos || [] });
}));
api.post('/atalho/chave', wrap(async (_req, res) => {
  const cfg = await lerConfigAtalho();
  cfg.chave = crypto.randomBytes(18).toString('base64url'); // trocar a chave desliga o atalho antigo
  await gravarConfigAtalho(cfg);
  res.json({ chave: cfg.chave });
}));
api.put('/atalho', wrap(async (req, res) => {
  const cfg = await lerConfigAtalho();
  if (req.body?.conta !== undefined) cfg.conta = validarId(req.body.conta) ? req.body.conta : null;
  if (req.body?.cartoes && typeof req.body.cartoes === 'object') {
    cfg.cartoes = Object.fromEntries(Object.entries(req.body.cartoes).slice(0, 30).map(([k, v]) => [String(k).slice(0, 80), validarId(v) ? v : null]));
  }
  await gravarConfigAtalho(cfg);
  res.json({ ok: true });
}));
api.delete('/atalho', wrap(async (_req, res) => {
  const cfg = await lerConfigAtalho();
  delete cfg.chave;
  await gravarConfigAtalho(cfg);
  res.status(204).end();
}));

api.delete('/lancamentos/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const l = await Lancamento.findByIdAndDelete(req.params.id);
  if (l) await ContribuicaoMeta.deleteMany({ $or: [{ lancamento: l._id }, { salario: l._id }] }); // o dinheiro volta / a distribuição some
  // compra parcelada: ?todas=1 apaga também as outras parcelas
  if (l?.parcela?.grupo && req.query.todas === '1') await Lancamento.deleteMany({ 'parcela.grupo': l.parcela.grupo });
  if (l?.recorrente && l.competencia) {
    await Recorrente.updateOne({ _id: l.recorrente }, { $addToSet: { ignoradas: l.competencia } });
  }
  res.status(204).end();
}));

// ---------- recorrentes ----------
const camposRecorrente = ({ tipo, descricao, valor, moeda, categoria, conta, frequencia, diaDoMes, inicio, fim, ativo }) =>
  Object.fromEntries(
    Object.entries({
      tipo, descricao, valor: valor === undefined ? undefined : round2(valor), moeda,
      categoria: categoria || (categoria === undefined ? undefined : null), conta: idOuNulo(conta),
      frequencia, diaDoMes, inicio, fim: fim || (fim === undefined ? undefined : null), ativo,
    }).filter(([, v]) => v !== undefined)
  );

api.get('/recorrentes', wrap(async (_req, res) => {
  const recs = await Recorrente.find().sort({ ativo: -1, diaDoMes: 1 }).lean();
  const hoje = new Date();
  // próxima data prevista
  const out = recs.map((r) => {
    let prox = null;
    if (r.ativo) {
      for (let i = 0; i < 24 && !prox; i++) {
        const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + i, 1));
        const cand = diaNoMes(mesDe(d), r.diaDoMes);
        const intervalo = r.frequencia === 'anual' ? 12 : r.frequencia === 'trimestral' ? 3 : 1;
        const ini = new Date(r.inicio);
        const diffMeses = (cand.getUTCFullYear() - ini.getUTCFullYear()) * 12 + cand.getUTCMonth() - ini.getUTCMonth();
        if (cand > hoje && cand >= ini && diffMeses % intervalo === 0 && (!r.fim || cand <= new Date(r.fim))) prox = cand;
      }
    }
    return { ...r, proxima: prox };
  });
  res.json(out);
}));
api.post('/recorrentes', wrap(async (req, res) => {
  const r = await Recorrente.create(camposRecorrente(req.body));
  await gerarRecorrentes();
  res.status(201).json(r);
}));
api.put('/recorrentes/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const r = await Recorrente.findByIdAndUpdate(req.params.id, camposRecorrente(req.body), { new: true, runValidators: true });
  if (!r) return erro(res, 404, 'Recorrência não encontrada');
  await gerarRecorrentes();
  res.json(r);
}));
api.delete('/recorrentes/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  if (req.query.apagarLancamentos === '1') await Lancamento.deleteMany({ recorrente: req.params.id });
  else await Lancamento.updateMany({ recorrente: req.params.id }, { $set: { recorrente: null, competencia: null } });
  await Recorrente.findByIdAndDelete(req.params.id);
  res.status(204).end();
}));

// ---------- resumo do mês (com orçamento por categoria) ----------
api.get('/resumo', wrap(async (req, res) => {
  await gerarRecorrentes();
  const mes = MES_RE.test(req.query.mes || '') ? req.query.mes : mesDe(new Date());
  const base = ['EUR', 'BRL', 'USD'].includes(req.query.base) ? req.query.base : 'EUR';
  const { taxas, fonte, data: dataCambio } = await obterTaxas();
  const conv = (v, m) => converter(v, m, base, taxas);

  await sincronizarTodas();
  const [cats, lancs, contas] = await Promise.all([
    Categoria.find().lean(),
    Lancamento.find({ data: intervaloDoMes(mes) }).lean(),
    ContaRendimento.find().lean(),
  ]);

  let receitas = 0, despesas = 0;
  const porCat = new Map();
  const fixoPorCat = new Map(); // parte vinda de recorrentes (não entra na projeção por ritmo)
  for (const l of lancs) {
    if (l.tipo === 'transferencia' || l.ajuste) continue; // só movem dinheiro entre contas
    const v = conv(l.valor, l.moeda);
    if (l.tipo === 'receita') receitas += v; else despesas += v;
    const k = l.categoria ? String(l.categoria) : 'sem';
    porCat.set(k, (porCat.get(k) || 0) + (l.tipo === 'despesa' ? v : 0));
    if (l.tipo === 'despesa' && l.recorrente) fixoPorCat.set(k, (fixoPorCat.get(k) || 0) + v);
  }

  // fração do mês já passada (para "ritmo" do orçamento)
  const hoje = new Date();
  const [y, m] = mes.split('-').map(Number);
  const diasNoMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const fracao = mes < mesDe(hoje) ? 1 : mes > mesDe(hoje) ? 0 : hoje.getUTCDate() / diasNoMes;

  const orcamentos = cats
    .filter((c) => c.tipo === 'despesa')
    .map((c) => {
      const gasto = round2(porCat.get(String(c._id)) || 0);
      const limite = round2(conv(c.orcamentoMensal || 0, c.moeda));
      const pct = limite > 0 ? round2((gasto / limite) * 100) : null;
      const estado = !limite ? 'sem-orcamento' : pct >= 100 ? 'estourado' : pct >= c.alertaPct ? 'alerta' : 'ok';
      return {
        categoria: c._id, nome: c.nome, cor: c.cor, icone: c.icone, gasto, limite, pct, estado,
        restante: limite ? round2(limite - gasto) : null,
        // projeção no fim do mês: recorrentes contam uma vez; o variável segue o ritmo atual
        ritmo: limite && fracao > 0 ? round2(((porCat.get(String(c._id)) || 0) - (fixoPorCat.get(String(c._id)) || 0)) / fracao + (fixoPorCat.get(String(c._id)) || 0)) : null,
      };
    })
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));

  const semCategoria = round2(porCat.get('sem') || 0);
  const totalOrcado = round2(orcamentos.reduce((s, o) => s + (o.limite || 0), 0));
  const gastoOrcado = round2(orcamentos.filter((o) => o.limite).reduce((s, o) => s + o.gasto, 0));

  const contasResumo = await Promise.all(contas.map(async (c) => {
    const movs = await Movimento.find({ conta: c._id }).lean();
    const met = metricasConta(c, movs);
    return {
      _id: c._id, nome: c.nome, moeda: c.moeda,
      saldo: met.saldoAtual, saldoBase: round2(conv(met.saldoAtual, c.moeda)),
      jurosMes: met.mes.juros, saidasMes: met.mes.saidas,
    };
  }));

  await garantirPoupanca();
  const metasResumo = await resumoMetas();
  // depósitos em metas no mês saem do saldo do mês (retiradas voltam)
  // e o dinheiro separado para viagens (menos o que já foi gasto com ele)
  const metasMes = round2(guardadoNoMes(await ContribuicaoMeta.find({ data: intervaloDoMes(mes) }).lean(), await Meta.find().lean(), conv, mes)
    + separadoViagensNoMes(await ReservaViagem.find({ data: intervaloDoMes(mes) }).lean(), await Viagem.find().lean(), lancs, conv, mes));
  const dadosCarteira = await carregarCarteira();
  const pat = patrimonio({ ...dadosCarteira, conv });
  const proximos = lembretes({
    recorrentes: await Recorrente.find({ ativo: true }).lean(), cartoes: dadosCarteira.contas.filter((c) => c.tipo === 'cartao' && !c.arquivada),
    lancamentos: dadosCarteira.lancamentos, orcamentos: [], hoje, dias: 7,
  });

  res.json({
    mes, base, cambio: { fonte, data: dataCambio, taxas }, metas: metasResumo,
    patrimonio: { ativos: pat.ativos, passivos: pat.passivos, liquido: pat.liquido }, temContas: dadosCarteira.contas.length > 0, proximos,
    receitas: round2(receitas), despesas: round2(despesas), metasMes, paraRevisar: await Lancamento.countDocuments({ revisar: true }), saldo: round2(receitas - despesas - metasMes),
    quantidade: lancs.length,
    orcamentos, semCategoria, totalOrcado, gastoOrcado, fracaoDoMes: round2(fracao),
    contas: contasResumo,
    patrimonioContas: round2(contasResumo.reduce((s, c) => s + c.saldoBase, 0)),
  });
}));

// ---------- contas de rendimento ----------
const camposConta = ({ nome, instituicao, moeda, saldoInicial, dataInicio, modo, taxa, nota, rendimentoAutomatico }) =>
  Object.fromEntries(
    Object.entries({ nome, instituicao, moeda, saldoInicial: saldoInicial === undefined ? undefined : round2(saldoInicial), dataInicio, modo, taxa, nota, rendimentoAutomatico })
      .filter(([, v]) => v !== undefined)
  );

api.get('/contas', wrap(async (_req, res) => {
  await sincronizarTodas();
  const contas = await ContaRendimento.find().sort({ createdAt: 1 }).lean();
  const out = await Promise.all(contas.map(async (c) => {
    const movs = await Movimento.find({ conta: c._id }).lean();
    const m = metricasConta(c, movs);
    return { ...c, saldoAtual: m.saldoAtual, jurosMes: m.mes.juros, saidasMes: m.mes.saidas, rendimentoLancado: m.mes.rendimentoLancado };
  }));
  res.json(out);
}));
api.post('/contas', wrap(async (req, res) => {
  const dados = camposConta(req.body);
  // "incluir meses anteriores": o automático vale desde a data do saldo inicial
  dados.autoDesde = req.body?.incluirAnteriores && dados.dataInicio ? dados.dataInicio : new Date();
  const c = await ContaRendimento.create(dados);
  await sincronizarRendimentos(c.toObject());
  res.status(201).json(c);
}));
api.put('/contas/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const antes = await ContaRendimento.findById(req.params.id).lean();
  if (!antes) return erro(res, 404, 'Conta não encontrada');
  const dados = camposConta(req.body);
  // ligar o automático agora não preenche meses passados
  if (dados.rendimentoAutomatico && !antes.rendimentoAutomatico) dados.autoDesde = new Date();
  const c = await ContaRendimento.findByIdAndUpdate(req.params.id, dados, { new: true, runValidators: true });
  res.json(c);
}));
api.delete('/contas/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  await Movimento.deleteMany({ conta: req.params.id });
  await ContaRendimento.findByIdAndDelete(req.params.id);
  res.status(204).end();
}));

api.get('/contas/:id/metricas', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const c = await ContaRendimento.findById(req.params.id).lean();
  if (!c) return erro(res, 404, 'Conta não encontrada');
  await sincronizarRendimentos(c);
  const movs = await Movimento.find({ conta: c._id }).lean();
  res.json({ conta: c, ...metricasConta(c, movs) });
}));

api.get('/contas/:id/movimentos', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  res.json(await Movimento.find({ conta: req.params.id }).sort({ data: -1, createdAt: -1 }));
}));

const camposMovimento = ({ tipo, valor, data, descricao }) =>
  Object.fromEntries(Object.entries({ tipo, valor: valor === undefined ? undefined : round2(valor), data, descricao }).filter(([, v]) => v !== undefined));

api.post('/contas/:id/movimentos', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const c = await ContaRendimento.findById(req.params.id).lean();
  if (!c) return erro(res, 404, 'Conta não encontrada');
  const dados = camposMovimento(req.body);
  if (SAIDAS.includes(dados.tipo)) {
    const movs = await Movimento.find({ conta: c._id }).lean();
    const saldo = saldoAte(c, movs, new Date(8640000000000000));
    if (dados.valor > saldo) return erro(res, 400, `Saída maior que o saldo disponível (${saldo.toFixed(2)})`, 'saida_maior_saldo', { saldo, moeda: c.moeda });
  }
  res.status(201).json(await Movimento.create({ ...dados, conta: c._id }));
}));
api.put('/movimentos/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const m = await Movimento.findByIdAndUpdate(req.params.id, camposMovimento(req.body), { new: true, runValidators: true });
  m ? res.json(m) : erro(res, 404, 'Movimento não encontrado');
}));
api.delete('/movimentos/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const m = await Movimento.findByIdAndDelete(req.params.id).lean();
  // rendimento apagado à mão: o automático não volta a lançar esse mês
  if (m?.tipo === 'rendimento') await ContaRendimento.updateOne({ _id: m.conta }, { $addToSet: { rendimentoIgnorado: mesDe(m.data) } });
  res.status(204).end();
}));

/**
 * Lança o rendimento de um mês.
 * Modo mensal/anual: juros = saldo no fim do mês (antes dos juros) × taxa mensal.
 * Modo manual: usa o valor enviado (o que veio no extrato).
 */
api.post('/contas/:id/aplicar-rendimento', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const c = await ContaRendimento.findById(req.params.id).lean();
  if (!c) return erro(res, 404, 'Conta não encontrada');
  const mes = MES_RE.test(req.body?.mes || '') ? req.body.mes : mesDe(new Date());
  if (mes < mesDe(c.dataInicio)) return erro(res, 400, 'Mês anterior ao início da conta', 'mes_anterior_inicio');

  const movs = await Movimento.find({ conta: c._id }).lean();
  const jaTem = movs.some((m) => m.tipo === 'rendimento' && mesDe(m.data) === mes);
  if (jaTem && !req.body?.forcar) return erro(res, 409, 'Já existe rendimento lançado neste mês', 'rendimento_duplicado');

  const fim = ultimoDiaDoMes(mes);
  const base = saldoAte(c, movs.filter((m) => !(m.tipo === 'rendimento' && mesDe(m.data) === mes)), fim);
  const r = taxaMensal(c);
  let valor;
  if (req.body?.valor !== undefined && req.body.valor !== '') valor = round2(req.body.valor);
  else if (r === null) return erro(res, 400, 'Conta em modo manual: informe o valor do rendimento', 'informe_valor');
  else valor = round2(Math.max(0, base) * r);

  const mov = await Movimento.create({
    conta: c._id, tipo: 'rendimento', valor, data: fim, automatico: false, descricao: '',
  });
  res.status(201).json({ movimento: mov, base, taxaMensal: r });
}));

// ---------- metas de poupança ----------
const MODOS_SALARIO = ['excedente', 'pct', 'fixo'];
const camposMeta = ({ nome, icone, cor, valorAlvo, moeda, prazo, pessoas, arquivada, mensal, regraSalario }) =>
  Object.fromEntries(Object.entries({
    regraSalario: regraSalario === undefined ? undefined : {
      ativo: !!regraSalario?.ativo, modo: MODOS_SALARIO.includes(regraSalario?.modo) ? regraSalario.modo : 'excedente',
      valor: Math.max(0, round2(Number(regraSalario?.valor) || 0)), limite: Math.max(0, round2(Number(regraSalario?.limite) || 0)),
      categoria: idOuNulo(regraSalario?.categoria) ?? null, conta: idOuNulo(regraSalario?.conta) ?? null,
    },
    mensal: mensal === undefined ? undefined : {
      valor: Math.max(0, round2(Number(mensal?.valor) || 0)), dia: Math.min(31, Math.max(1, Math.floor(Number(mensal?.dia) || 1))),
      conta: idOuNulo(mensal?.conta) ?? null,
    },
    nome, icone, cor, valorAlvo: valorAlvo === undefined ? undefined : round2(valorAlvo), moeda,
    prazo: prazo === undefined ? undefined : prazo || null,
    pessoas: Array.isArray(pessoas) ? [...new Set(pessoas.map((p) => String(p).trim()).filter(Boolean))].slice(0, 6) : undefined,
    arquivada,
  }).filter(([, v]) => v !== undefined));

async function metaComMetricas(meta) {
  const contribs = await ContribuicaoMeta.find({ meta: meta._id }).lean();
  return { ...meta, ...metricasMeta(meta, contribs) };
}
async function resumoMetas() {
  const metas = await Meta.find({ arquivada: false }).sort({ createdAt: 1 }).lean();
  return Promise.all(metas.map(async (m) => {
    const x = await metaComMetricas(m);
    return { _id: x._id, nome: x.nome, icone: x.icone, cor: x.cor, moeda: x.moeda, valorAlvo: x.valorAlvo, guardado: x.guardado, pct: x.pct, estado: x.estado, prazo: x.prazo, tipo: x.tipo || 'meta' };
  }));
}

api.get('/metas', wrap(async (_req, res) => {
  await garantirPoupanca();
  await gerarDepositosAutomaticos();
  // a poupança vem primeiro
  const metas = (await Meta.find().sort({ arquivada: 1, createdAt: 1 }).lean()).sort((a, b) => (b.tipo === 'poupanca') - (a.tipo === 'poupanca'));
  res.json(await Promise.all(metas.map(metaComMetricas)));
}));
api.post('/metas', wrap(async (req, res) => {
  const campos = camposMeta(req.body);
  if (campos.mensal?.valor > 0) campos.mensal.desde = new Date();
  if (campos.regraSalario?.ativo) campos.regraSalario.desde = new Date();
  const meta = await Meta.create(campos);
  // "já guardado" vira a primeira contribuição
  const inicial = round2(Number(req.body?.jaGuardado) || 0);
  if (inicial > 0) await ContribuicaoMeta.create({ meta: meta._id, valor: inicial, data: new Date(), pessoa: '', nota: '', registro: true }); // já estava guardado
  await gerarDepositosAutomaticos();
  res.status(201).json(await metaComMetricas(meta.toObject()));
}));
api.put('/metas/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const antes = await Meta.findById(req.params.id).lean();
  if (!antes) return erro(res, 404, 'Meta não encontrada');
  const campos = camposMeta(req.body);
  // ao ligar o depósito automático, começa agora (não cria meses passados)
  if (campos.mensal) campos.mensal.desde = campos.mensal.valor > 0 ? (antes.mensal?.valor > 0 && antes.mensal?.desde ? antes.mensal.desde : new Date()) : null;
  // a regra do salário vale a partir de quando foi ligada (não mexe em salários antigos)
  if (campos.regraSalario) {
    if (campos.regraSalario.ativo && !campos.regraSalario.categoria) return erro(res, 400, 'Escolha a categoria do salário', 'categoria_salario');
    campos.regraSalario.desde = campos.regraSalario.ativo ? (antes.regraSalario?.ativo && antes.regraSalario?.desde ? antes.regraSalario.desde : new Date()) : null;
  }
  const m = await Meta.findByIdAndUpdate(req.params.id, campos, { new: true, runValidators: true }).lean();
  await gerarDepositosAutomaticos();
  res.json(await metaComMetricas(m));
}));
api.delete('/metas/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  await ContribuicaoMeta.deleteMany({ meta: req.params.id });
  await Lancamento.updateMany({ meta: req.params.id }, { meta: null });
  await Meta.findByIdAndDelete(req.params.id);
  res.status(204).end();
}));

const camposContrib = ({ valor, data, pessoa, nota, conta, valorConta, registro }) =>
  Object.fromEntries(Object.entries({
    registro: registro === undefined ? undefined : !!registro,
    valor: valor === undefined ? undefined : round2(valor), data, pessoa, nota, conta: registro ? null : idOuNulo(conta),
    valorConta: valorConta === undefined ? undefined : valorConta === null || valorConta === '' ? null : round2(valorConta),
  }).filter(([, v]) => v !== undefined));

/** Conta de onde sai (ou para onde volta) dinheiro separado: só contas com dinheiro de verdade */
const ORIGENS_BASE = ['corrente', 'dinheiro', 'investimento'];
const ORIGENS = ORIGENS_BASE;
async function contaDeOrigem(id) {
  if (!id) return null;
  const c = await Conta.findById(id).lean();
  if (!c || !ORIGENS.includes(c.tipo)) throw Object.assign(new Error('Escolha uma conta corrente, dinheiro ou investimento'), { status: 400, codigo: 'conta_origem_invalida' });
  return c;
}
/** Valor na moeda da conta (sinal igual ao valor), convertido pelo câmbio do dia se não foi informado */
async function valorNaMoedaDaConta(conta, valor, moeda, valorInformado, data) {
  if (!conta || conta.moeda === moeda) return null;
  if (valorInformado != null && valorInformado !== '') return Math.sign(valor) * Math.abs(round2(valorInformado));
  return round2(converter(valor, moeda, conta.moeda, await taxasNaData(new Date(data || Date.now()).toISOString().slice(0, 10))));
}

api.get('/metas/:id/contribuicoes', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  res.json(await ContribuicaoMeta.find({ meta: req.params.id }).sort({ data: -1, createdAt: -1 }));
}));
api.post('/metas/:id/contribuicoes', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const meta = await Meta.findById(req.params.id).lean();
  if (!meta) return erro(res, 404, 'Meta não encontrada');
  const dados = camposContrib(req.body);
  if (!dados.valor) return erro(res, 400, 'Informe um valor', 'dados_invalidos');
  if (dados.valor < 0) {
    const guardado = (await ContribuicaoMeta.find({ meta: meta._id }).lean()).reduce((s, c) => s + c.valor, 0);
    if (-dados.valor > guardado + 0.001) return erro(res, 400, 'Retirada maior que o guardado', 'retirada_maior_guardado', { saldo: round2(guardado), moeda: meta.moeda });
  }
  const conta = await contaDeOrigem(dados.conta);
  dados.valorConta = await valorNaMoedaDaConta(conta, dados.valor, meta.moeda, dados.valorConta, dados.data);
  await ContribuicaoMeta.create({ ...dados, meta: meta._id });
  res.status(201).json(await metaComMetricas(meta));
}));
api.put('/contribuicoes/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const antes = await ContribuicaoMeta.findById(req.params.id).lean();
  if (!antes) return erro(res, 404, 'Não encontrado');
  const dados = camposContrib(req.body);
  if (antes.lancamento || antes.reservaViagem || antes.salario || antes.automatica) delete dados.registro; // esses sempre contam
  const junto = { ...antes, ...dados };
  if (junto.registro) { dados.conta = null; junto.conta = null; }
  const conta = await contaDeOrigem(junto.conta);
  const meta = await Meta.findById(antes.meta).lean();
  dados.valorConta = await valorNaMoedaDaConta(conta, junto.valor, meta?.moeda, dados.valorConta, junto.data);
  const c = await ContribuicaoMeta.findByIdAndUpdate(req.params.id, dados, { new: true, runValidators: true });
  c ? res.json(c) : erro(res, 404, 'Não encontrado');
}));
api.delete('/contribuicoes/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const c = await ContribuicaoMeta.findByIdAndDelete(req.params.id).lean();
  // depósito automático apagado não volta; retirada de um gasto apagada: o gasto passa a sair do saldo do mês
  if (c?.automatica && c.competencia) await Meta.updateOne({ _id: c.meta }, { $addToSet: { ignoradas: c.competencia } });
  if (c?.salario) await Meta.updateOne({ _id: c.meta }, { $addToSet: { ignoradosSalario: String(c.salario) } });
  if (c?.lancamento) await Lancamento.updateOne({ _id: c.lancamento }, { meta: null });
  if (c?.reservaViagem) await ReservaViagem.deleteOne({ _id: c.reservaViagem }); // desfaz a separação para a viagem
  res.status(204).end();
}));

// ---------- importação de extrato ----------
api.get('/regras', wrap(async (_req, res) => res.json(await RegraCategoria.find().lean())));
api.delete('/regras/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  await RegraCategoria.findByIdAndDelete(req.params.id);
  res.status(204).end();
}));

/**
 * Antes de importar: quais linhas já foram importadas e quais parecem repetir um lançamento existente
 * (mesmo tipo e valor, até 3 dias de diferença — por exemplo o aluguel que já entra pela recorrência).
 */
api.post('/importar/previa', wrap(async (req, res) => {
  const linhas = Array.isArray(req.body?.linhas) ? req.body.linhas.slice(0, 5000) : [];
  const ids = linhas.map((l) => String(l.importId));
  const ja = new Set((await Lancamento.find({ importId: { $in: ids } }, 'importId').lean()).map((l) => l.importId));
  const datas = linhas.map((l) => new Date(`${l.data}T12:00:00Z`).getTime()).filter(Number.isFinite);
  const possiveis = {};
  if (datas.length) {
    const tres = 3 * 86400000;
    const existentes = await Lancamento.find({
      importId: null, data: { $gte: new Date(Math.min(...datas) - tres), $lte: new Date(Math.max(...datas) + tres) },
    }, 'tipo valor data descricao').lean();
    for (const l of linhas) {
      if (ja.has(String(l.importId))) continue;
      const t = new Date(`${l.data}T12:00:00Z`).getTime();
      const par = existentes.find((e) => e.tipo === l.tipo && Math.abs(e.valor - l.valor) < 0.005 && Math.abs(new Date(e.data).getTime() - t) <= tres);
      if (par) possiveis[l.importId] = { descricao: par.descricao, data: par.data };
    }
  }
  res.json({ jaImportados: [...ja], possiveis });
}));

api.post('/importar', wrap(async (req, res) => {
  const linhas = Array.isArray(req.body?.linhas) ? req.body.linhas.slice(0, 5000) : [];
  let docs = linhas.map((l) => ({
    tipo: l.tipo === 'receita' ? 'receita' : 'despesa', descricao: String(l.descricao || '—').slice(0, 120), valor: round2(Math.abs(Number(l.valor))),
    moeda: ['EUR', 'BRL', 'USD'].includes(l.moeda) ? l.moeda : 'EUR', data: new Date(`${l.data}T12:00:00Z`),
    categoria: validarId(l.categoria) ? l.categoria : null, nota: String(l.nota || '').slice(0, 200), importId: String(l.importId),
    conta: validarId(req.body?.conta) ? req.body.conta : null,
  })).filter((d) => d.valor > 0 && !Number.isNaN(d.data.getTime()));
  // não importa de novo o que já existe (o índice único também protege, mas a checagem deixa a contagem certa)
  const existentes = new Set((await Lancamento.find({ importId: { $in: docs.map((d) => d.importId) } }, 'importId').lean()).map((l) => l.importId));
  const vistos = new Set();
  const total = docs.length;
  docs = docs.filter((d) => !existentes.has(d.importId) && !vistos.has(d.importId) && vistos.add(d.importId));
  await definirValorConta(docs);
  let criados = 0;
  if (docs.length) try {
    criados = (await Lancamento.insertMany(docs, { ordered: false })).length;
  } catch (e) {
    if (e.code !== 11000 && !e.writeErrors) throw e;
    criados = e.insertedDocs?.length ?? e.result?.insertedCount ?? (docs.length - (e.writeErrors?.length || 0));
  }
  // categorias escolhidas à mão viram regras para os próximos extratos
  const regras = (Array.isArray(req.body?.regras) ? req.body.regras : []).filter((r) => r.texto && validarId(r.categoria)).slice(0, 500);
  for (const r of regras) {
    await RegraCategoria.updateOne({ texto: String(r.texto).toLowerCase().trim() }, { $set: { categoria: r.categoria } }, { upsert: true });
  }
  res.status(201).json({ criados, ignorados: total - criados, regras: regras.length });
}));

// ---------- contas, cartões e patrimônio ----------
/** Depósitos em metas e dinheiro separado para viagens, como movimentos das contas */
async function separados(contas) {
  const [contribuicoes, reservasViagem, gastosReserva] = await Promise.all([
    ContribuicaoMeta.find({ conta: { $ne: null } }).lean(), ReservaViagem.find().lean(), Lancamento.find({ reservaViagem: true }).lean(),
  ]);
  if (!contribuicoes.length && !reservasViagem.length && !gastosReserva.length) return { lancamentos: [], reservas: [] };
  const [metas, viagens, cs] = await Promise.all([Meta.find().lean(), Viagem.find().lean(), contas ? contas : Conta.find().lean()]);
  return movimentosSeparados({ contribuicoes, metas, reservasViagem, viagens, gastosReserva, contas: cs });
}
async function carregarCarteira() {
  const [contas, contasRend, movsRend] = await Promise.all([Conta.find().sort({ createdAt: 1 }).lean(), ContaRendimento.find().lean(), Movimento.find().lean()]);
  const ids = contas.map((c) => c._id);
  const lancamentos = ids.length ? await Lancamento.find({ $or: [{ conta: { $in: ids } }, { contaDestino: { $in: ids } }] }).lean() : [];
  const sep = await separados(contas);
  return { contas, contasRend, movsRend, lancamentos: [...lancamentos, ...sep.lancamentos], reservas: sep.reservas };
}
const camposConta2 = ({ nome, tipo, instituicao, moeda, saldoInicial, dataInicio, cor, arquivada, limite, diaFechamento, diaVencimento, contaPagamento }) =>
  Object.fromEntries(Object.entries({
    nome, tipo, instituicao, moeda, saldoInicial: saldoInicial === undefined ? undefined : round2(saldoInicial), dataInicio, cor, arquivada,
    limite: limite === undefined ? undefined : round2(limite), diaFechamento, diaVencimento, contaPagamento: idOuNulo(contaPagamento),
  }).filter(([, v]) => v !== undefined));

api.get('/carteira', wrap(async (req, res) => {
  await sincronizarTodas();
  const base = ['EUR', 'BRL', 'USD'].includes(req.query.base) ? req.query.base : 'EUR';
  const { taxas } = await obterTaxas();
  const conv = (v, m) => converter(v, m, base, taxas);
  const dados = await carregarCarteira();
  const hoje = new Date();
  const contas = dados.contas.map((c) => {
    const saldo = saldoConta(c, dados.lancamentos);
    return { ...c, saldo, saldoBase: round2(conv(saldo, c.moeda)), cartao: c.tipo === 'cartao' ? resumoCartao(c, dados.lancamentos, hoje) : undefined };
  });
  const rendimento = await Promise.all(dados.contasRend.map(async (c) => {
    const movs = dados.movsRend.filter((m) => String(m.conta) === String(c._id));
    const m = metricasConta(c, movs);
    return { _id: c._id, nome: c.nome, instituicao: c.instituicao, moeda: c.moeda, saldo: m.saldoAtual, saldoBase: round2(conv(m.saldoAtual, c.moeda)), jurosMes: m.mes.juros };
  }));
  const pat = patrimonio({ ...dados, conv, ate: hoje });
  res.json({ base, contas, rendimento, patrimonio: pat, serie: seriePatrimonio({ ...dados, conv }, 12, hoje) });
}));
api.post('/carteira', wrap(async (req, res) => {
  const dados = camposConta2(req.body);
  if (dados.tipo === 'divida' && dados.saldoInicial > 0) dados.saldoInicial = -dados.saldoInicial; // "valor devido" vira saldo negativo
  if (dados.tipo === 'cartao' && dados.saldoInicial > 0) dados.saldoInicial = -dados.saldoInicial;
  res.status(201).json(await Conta.create(dados));
}));
api.put('/carteira/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const antes = await Conta.findById(req.params.id).lean();
  if (!antes) return erro(res, 404, 'Conta não encontrada');
  const dados = camposConta2(req.body);
  const tipo = dados.tipo || antes.tipo;
  if ((tipo === 'divida' || tipo === 'cartao') && dados.saldoInicial > 0) dados.saldoInicial = -dados.saldoInicial;
  res.json(await Conta.findByIdAndUpdate(req.params.id, dados, { new: true, runValidators: true }));
}));
api.delete('/carteira/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const usados = await Lancamento.countDocuments({ $or: [{ conta: req.params.id }, { contaDestino: req.params.id }] })
    + await ContribuicaoMeta.countDocuments({ conta: req.params.id }) + await ReservaViagem.countDocuments({ conta: req.params.id });
  if (usados) return erro(res, 409, 'A conta tem lançamentos. Arquive em vez de apagar.', 'conta_com_lancamentos', { n: usados });
  await Recorrente.updateMany({ conta: req.params.id }, { conta: null });
  await Conta.findByIdAndDelete(req.params.id);
  res.status(204).end();
}));
/** Corrige o saldo para o valor real (ex.: extrato do banco ou valor atual do investimento) */
api.post('/carteira/:id/ajuste', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const c = await Conta.findById(req.params.id).lean();
  if (!c) return erro(res, 404, 'Conta não encontrada');
  const lancs = [...await Lancamento.find({ $or: [{ conta: c._id }, { contaDestino: c._id }] }).lean(), ...(await separados()).lancamentos];
  const data = req.body?.data ? new Date(`${String(req.body.data).slice(0, 10)}T12:00:00Z`) : new Date();
  const atual = saldoConta(c, lancs, data);
  const diferenca = round2(Number(req.body?.saldo) - atual);
  if (!Number.isFinite(diferenca)) return erro(res, 400, 'Informe o saldo', 'dados_invalidos');
  if (Math.abs(diferenca) < 0.005) return res.json({ diferenca: 0 });
  const l = await Lancamento.create({
    tipo: diferenca > 0 ? 'receita' : 'despesa', descricao: String(req.body?.descricao || 'Ajuste de saldo').slice(0, 120), valor: Math.abs(diferenca),
    moeda: c.moeda, data, conta: c._id, ajuste: true,
  });
  res.status(201).json({ diferenca, lancamento: l });
}));
api.get('/carteira/:id/faturas', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const c = await Conta.findById(req.params.id).lean();
  if (!c || c.tipo !== 'cartao') return erro(res, 404, 'Cartão não encontrado');
  // inclui o que foi tirado do cartão para viagens
  const lancs = [...await Lancamento.find({ $or: [{ conta: c._id }, { contaDestino: c._id }] }).lean(), ...(await separados()).lancamentos.filter((l) => String(l.conta) === String(c._id))];
  res.json({ cartao: c, ...resumoCartao(c, lancs), faturas: faturasCartao(c, lancs) });
}));
/** Paga uma fatura: transferência da conta escolhida para o cartão */
api.post('/carteira/:id/pagar', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const c = await Conta.findById(req.params.id).lean();
  if (!c || c.tipo !== 'cartao') return erro(res, 404, 'Cartão não encontrado');
  const origem = validarId(req.body?.origem) ? req.body.origem : c.contaPagamento;
  if (!origem) return erro(res, 400, 'Escolha a conta de onde sai o pagamento', 'escolha_origem');
  const valor = round2(req.body?.valor);
  if (!(valor > 0)) return erro(res, 400, 'Informe um valor', 'dados_invalidos');
  const contaOrigem = await Conta.findById(origem).lean();
  const l = await Lancamento.create({
    tipo: 'transferencia', descricao: String(req.body?.descricao || `${c.nome} · ${req.body?.mes || ''}`).trim().slice(0, 120), valor: req.body?.valorOrigem ? round2(req.body.valorOrigem) : valor,
    valorDestino: contaOrigem && contaOrigem.moeda !== c.moeda ? valor : null, moeda: contaOrigem?.moeda || c.moeda,
    data: req.body?.data ? new Date(`${String(req.body.data).slice(0, 10)}T12:00:00Z`) : new Date(),
    conta: origem, contaDestino: c._id, fatura: /^\d{4}-\d{2}$/.test(req.body?.mes || '') ? req.body.mes : null,
  });
  res.status(201).json(l);
}));

// ---------- viagens ----------
const camposViagem = ({ nome, icone, cor, moeda, orcamento, inicio, fim, arquivada }) =>
  Object.fromEntries(Object.entries({
    nome, icone, cor, moeda, orcamento: orcamento === undefined ? undefined : round2(orcamento),
    inicio: inicio === undefined ? undefined : inicio || null, fim: fim === undefined ? undefined : fim || null, arquivada,
  }).filter(([, v]) => v !== undefined));

async function viagensComResumo(filtro = {}) {
  const [viagens, categorias] = await Promise.all([Viagem.find(filtro).sort({ arquivada: 1, inicio: -1, createdAt: -1 }).lean(), Categoria.find().lean()]);
  const ids = viagens.map((v) => v._id);
  const [lancs, reservas] = ids.length ? await Promise.all([Lancamento.find({ viagem: { $in: ids } }).lean(), ReservaViagem.find({ viagem: { $in: ids } }).sort({ data: -1 }).lean()]) : [[], []];
  const conv = await conversorPorDia(lancs.map((l) => new Date(l.data).toISOString().slice(0, 10)));
  return { viagens: viagens.map((v) => ({ ...v, ...resumoViagem(v, lancs, conv, categorias, new Date(), reservas) })), lancs, reservas };
}
api.get('/viagens', wrap(async (_req, res) => res.json((await viagensComResumo()).viagens)));
api.get('/viagens/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const { viagens, lancs, reservas } = await viagensComResumo({ _id: req.params.id });
  if (!viagens.length) return erro(res, 404, 'Viagem não encontrada');
  res.json({ ...viagens[0], lancamentos: lancs.sort((a, b) => new Date(b.data) - new Date(a.data)), reservas });
}));
/**
 * Separa dinheiro para a viagem (devolver = valor negativo). De onde vem:
 * - nada escolhido: saldo do mês;  - `meta`: sai da poupança/meta (retirada ligada);
 * - `conta`: sai de uma conta, inclusive do cartão de crédito (entra na fatura).
 * `valor` é na moeda da viagem; `valorConta` (opcional) é o que sai da conta, se a moeda for outra.
 */
const ORIGENS_VIAGEM = [...ORIGENS_BASE, 'cartao'];
api.post('/viagens/:id/reservas', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const v = await Viagem.findById(req.params.id).lean();
  if (!v) return erro(res, 404, 'Viagem não encontrada');
  const valor = round2(Number(req.body?.valor));
  if (!valor) return erro(res, 400, 'Informe um valor', 'dados_invalidos');
  const data = req.body?.data ? new Date(`${String(req.body.data).slice(0, 10)}T12:00:00Z`) : new Date();
  const nota = String(req.body?.nota || '').slice(0, 200);
  let conta = null, meta = null, vMeta = 0;
  if (validarId(req.body?.meta)) {
    meta = await Meta.findById(req.body.meta).lean();
    if (!meta) return erro(res, 404, 'Meta não encontrada');
    vMeta = v.moeda === meta.moeda ? valor : round2(converter(valor, v.moeda, meta.moeda, await taxasNaData(data.toISOString().slice(0, 10))));
    const contribs = await ContribuicaoMeta.find({ meta: meta._id }).sort({ data: -1 }).lean();
    const guardado = round2(contribs.reduce((s, c) => s + Number(c.valor), 0));
    if (vMeta > guardado + 0.004) return erro(res, 400, 'Retirada maior que o guardado', 'retirada_maior_guardado', { saldo: guardado, moeda: meta.moeda });
    // se o dinheiro da meta tinha saído de uma conta, ele passa por essa conta (para os saldos baterem)
    const emConta = contribs.filter((c) => c.conta).reduce((s, c) => s + Number(c.valor), 0);
    const ultima = contribs.find((c) => c.conta && c.valor > 0)?.conta;
    if (ultima && (vMeta < 0 || emConta >= vMeta - 0.004)) conta = await Conta.findById(ultima).lean();
  } else if (validarId(req.body?.conta)) {
    conta = await Conta.findById(req.body.conta).lean();
    if (!conta || !ORIGENS_VIAGEM.includes(conta.tipo)) return erro(res, 400, 'Conta inválida', 'conta_origem_invalida');
  }
  const naConta = conta ? await valorNaMoedaDaConta(conta, valor, v.moeda, meta ? null : req.body?.valorConta, data) : null;
  const [valorConta, valorViagem] = naConta == null ? [valor, null] : [naConta, valor];
  const r = await ReservaViagem.create({ viagem: v._id, conta: conta?._id || null, meta: meta?._id || null, valor: valorConta, valorViagem, data, nota });
  if (meta) {
    await ContribuicaoMeta.create({
      meta: meta._id, valor: -vMeta, data, conta: conta?._id || null, valorConta: conta ? await valorNaMoedaDaConta(conta, -vMeta, meta.moeda, null, data) : null,
      nota: `${v.icone || '✈️'} ${v.nome}`, reservaViagem: r._id, pessoa: '',
    });
  }
  res.status(201).json(r);
}));
api.delete('/reservas-viagem/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  await ReservaViagem.findByIdAndDelete(req.params.id);
  await ContribuicaoMeta.deleteMany({ reservaViagem: req.params.id }); // o dinheiro volta para a meta
  res.status(204).end();
}));
api.post('/viagens', wrap(async (req, res) => res.status(201).json(await Viagem.create(camposViagem(req.body)))));
api.put('/viagens/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const v = await Viagem.findByIdAndUpdate(req.params.id, camposViagem(req.body), { new: true, runValidators: true });
  v ? res.json(v) : erro(res, 404, 'Viagem não encontrada');
}));
api.delete('/viagens/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  await Lancamento.updateMany({ viagem: req.params.id }, { viagem: null, reservaViagem: false, valorConta: null });
  const ids = (await ReservaViagem.find({ viagem: req.params.id }, '_id').lean()).map((r) => r._id);
  await ContribuicaoMeta.deleteMany({ reservaViagem: { $in: ids } });
  await ReservaViagem.deleteMany({ viagem: req.params.id });
  await Viagem.findByIdAndDelete(req.params.id);
  res.status(204).end();
}));

// ---------- relatório anual ----------
api.get('/relatorio', wrap(async (req, res) => {
  await gerarRecorrentes();
  const ano = /^\d{4}$/.test(req.query.ano || '') ? Number(req.query.ano) : new Date().getUTCFullYear();
  const base = ['EUR', 'BRL', 'USD'].includes(req.query.base) ? req.query.base : 'EUR';
  const { taxas } = await obterTaxas();
  const conv = (v, m) => converter(v, m, base, taxas);
  const intervalo = { $gte: new Date(Date.UTC(ano, 0, 1)), $lt: new Date(Date.UTC(ano + 1, 0, 1)) };
  const [lancamentos, categorias, movsRend, contasRend, contribuicoes, metas, reservasViagem, viagens, primeiro] = await Promise.all([
    Lancamento.find({ data: intervalo }).lean(), Categoria.find().lean(), Movimento.find({ data: intervalo }).lean(), ContaRendimento.find().lean(),
    ContribuicaoMeta.find({ data: intervalo }).lean(), Meta.find().lean(), ReservaViagem.find({ data: intervalo }).lean(), Viagem.find().lean(),
    Lancamento.findOne().sort({ data: 1 }).lean(),
  ]);
  const anoAtual = new Date().getUTCFullYear();
  const desde = primeiro ? new Date(primeiro.data).getUTCFullYear() : anoAtual;
  res.json({ base, anos: Array.from({ length: Math.max(1, anoAtual - desde + 1) }, (_, i) => anoAtual - i), ...relatorioAnual({ ano, lancamentos, categorias, movsRend, contasRend, contribuicoes, metas, reservasViagem, viagens, conv }) });
}));

// ---------- lembretes no celular ----------
api.get('/push/chave', wrap(async (_req, res) => res.json({ chave: await chavePublica() })));
api.post('/push/inscrever', wrap(async (req, res) => {
  const ok = await inscrever(req.body?.inscricao, { idioma: req.body?.idioma, dias: req.body?.dias });
  ok ? res.status(201).json({ ok: true }) : erro(res, 400, 'Inscrição inválida', 'dados_invalidos');
}));
api.post('/push/cancelar', wrap(async (req, res) => { await cancelarInscricao(req.body?.endpoint); res.json({ ok: true }); }));
api.post('/push/teste', wrap(async (req, res) => res.json({ enviados: await enviarTeste(req.body?.endpoint) })));
api.get('/lembretes', wrap(async (req, res) => {
  const dias = Math.min(31, Math.max(1, Number(req.query.dias) || 7));
  const dados = await carregarCarteira();
  res.json(lembretes({ recorrentes: await Recorrente.find({ ativo: true }).lean(), cartoes: dados.contas.filter((c) => c.tipo === 'cartao' && !c.arquivada), lancamentos: dados.lancamentos, hoje: new Date(), dias }));
}));

// ---------- backup ----------
api.get('/exportar', wrap(async (_req, res) => {
  const [categorias, lancamentos, recorrentes, contas, movimentos, metas, contribuicoes, regras, carteira, viagens, reservasViagem] = await Promise.all([
    Categoria.find().lean(), Lancamento.find().lean(), Recorrente.find().lean(), ContaRendimento.find().lean(), Movimento.find().lean(),
    Meta.find().lean(), ContribuicaoMeta.find().lean(), RegraCategoria.find().lean(), Conta.find().lean(), Viagem.find().lean(), ReservaViagem.find().lean(),
  ]);
  res.setHeader('Content-Disposition', `attachment; filename="minhas-financas-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ versao: 5, exportadoEm: new Date(), categorias, lancamentos, recorrentes, contas, movimentos, metas, contribuicoes, regras, carteira, viagens, reservasViagem });
}));

export default api;
