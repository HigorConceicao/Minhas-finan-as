import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Categoria, Lancamento, Recorrente, ContaRendimento, Movimento } from './models.js';
import {
  metricasConta, competenciasDevidas, diaNoMes, mesDe, round2, saldoAte, taxaMensal, ultimoDiaDoMes, rendimentosAutomaticos, SAIDAS,
} from './finance.js';
import { obterTaxas, converter } from './cambio.js';

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
        tipo: rec.tipo, descricao: rec.descricao, valor: rec.valor, moeda: rec.moeda, categoria: rec.categoria,
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
  return criados;
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
const camposCategoria = ({ nome, tipo, cor, icone, orcamentoMensal, moeda, alertaPct }) =>
  Object.fromEntries(Object.entries({ nome, tipo, cor, icone, orcamentoMensal, moeda, alertaPct }).filter(([, v]) => v !== undefined));

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
  await Categoria.findByIdAndDelete(req.params.id);
  res.status(204).end();
}));

// ---------- lançamentos ----------
const camposLancamento = ({ tipo, descricao, valor, moeda, data, categoria, nota }) =>
  Object.fromEntries(
    Object.entries({ tipo, descricao, valor: valor === undefined ? undefined : round2(valor), moeda, data, categoria: categoria || (categoria === undefined ? undefined : null), nota })
      .filter(([, v]) => v !== undefined)
  );

api.get('/lancamentos', wrap(async (req, res) => {
  await gerarRecorrentes();
  const filtro = {};
  if (req.query.mes) {
    if (!MES_RE.test(req.query.mes)) return erro(res, 400, 'Mês inválido (use AAAA-MM)');
    filtro.data = intervaloDoMes(req.query.mes);
  }
  if (req.query.categoria && validarId(req.query.categoria)) filtro.categoria = req.query.categoria;
  res.json(await Lancamento.find(filtro).sort({ data: -1, createdAt: -1 }).limit(2000));
}));
api.post('/lancamentos', wrap(async (req, res) => res.status(201).json(await Lancamento.create(camposLancamento(req.body)))));
api.put('/lancamentos/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const l = await Lancamento.findByIdAndUpdate(req.params.id, camposLancamento(req.body), { new: true, runValidators: true });
  l ? res.json(l) : erro(res, 404, 'Lançamento não encontrado');
}));
api.delete('/lancamentos/:id', wrap(async (req, res) => {
  if (!validarId(req.params.id)) return erro(res, 400, 'ID inválido');
  const l = await Lancamento.findByIdAndDelete(req.params.id);
  if (l?.recorrente && l.competencia) {
    await Recorrente.updateOne({ _id: l.recorrente }, { $addToSet: { ignoradas: l.competencia } });
  }
  res.status(204).end();
}));

// ---------- recorrentes ----------
const camposRecorrente = ({ tipo, descricao, valor, moeda, categoria, frequencia, diaDoMes, inicio, fim, ativo }) =>
  Object.fromEntries(
    Object.entries({
      tipo, descricao, valor: valor === undefined ? undefined : round2(valor), moeda,
      categoria: categoria || (categoria === undefined ? undefined : null),
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

  res.json({
    mes, base, cambio: { fonte, data: dataCambio, taxas },
    receitas: round2(receitas), despesas: round2(despesas), saldo: round2(receitas - despesas),
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

// ---------- backup ----------
api.get('/exportar', wrap(async (_req, res) => {
  const [categorias, lancamentos, recorrentes, contas, movimentos] = await Promise.all([
    Categoria.find().lean(), Lancamento.find().lean(), Recorrente.find().lean(), ContaRendimento.find().lean(), Movimento.find().lean(),
  ]);
  res.setHeader('Content-Disposition', `attachment; filename="minhas-financas-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ versao: 2, exportadoEm: new Date(), categorias, lancamentos, recorrentes, contas, movimentos });
}));

export default api;
