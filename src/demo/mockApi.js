// API simulada para a demonstração: roda no navegador, em memória, com os mesmos cálculos do servidor.
import {
  metricasConta, competenciasDevidas, diaNoMes, mesDe, round2, saldoAte, taxaMensal, ultimoDiaDoMes, rendimentosAutomaticos, metricasMeta, SAIDAS,
} from '../../server/finance.js';

const TAXAS = { EUR: 1, BRL: 6.2, USD: 1.08 };
const converter = (v, de, para) => (de === para ? v : (Number(v) / TAXAS[de]) * TAXAS[para]);
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

let seq = 0;
const novoId = () => `d${(++seq).toString(16).padStart(6, '0')}`;
const agoraISO = () => new Date().toISOString();
const paraData = (v) => {
  if (!v) return null;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00.000Z` : new Date(s).toISOString();
};

class Erro extends Error { constructor(status, msg, codigo = null, dados) { super(msg); this.status = status; this.codigo = codigo; this.dados = dados; } }

const db = { categorias: [], lancamentos: [], recorrentes: [], contas: [], movimentos: [], metas: [], contribuicoes: [], regras: [] };

// ---------- dados de exemplo ----------
function semear() {
  for (const k of Object.keys(db)) db[k] = [];
  const add = (col, doc) => { const d = { _id: novoId(), createdAt: agoraISO(), updatedAt: agoraISO(), ...doc }; db[col].push(d); return d; };

  const cats = [
    ['Moradia', '🏠', '#8b5e3c', 900], ['Mercado', '🛒', '#5f7a4a', 400], ['Restaurantes', '🍽️', '#b5651d', 150],
    ['Transporte', '🚆', '#4a6378', 90], ['Saúde', '⚕️', '#7a4a5f', 0], ['Lazer', '🎭', '#9c7a2c', 120],
    ['Viagens', '✈️', '#3f7a78', 0], ['Assinaturas', '🔁', '#6b5b8a', 40], ['Educação', '📚', '#5a6b3a', 0], ['Outros', '•', '#7d7468', 0],
  ].map(([nome, icone, cor, orc]) => add('categorias', { nome, icone, cor, tipo: 'despesa', orcamentoMensal: orc, moeda: 'EUR', alertaPct: 80 }));
  const receitas = [['Salário', '💼', '#2f6b4f'], ['Extras', '✨', '#4f7a2f']]
    .map(([nome, icone, cor]) => add('categorias', { nome, icone, cor, tipo: 'receita', orcamentoMensal: 0, moeda: 'EUR', alertaPct: 80 }));
  const c = (n) => [...cats, ...receitas].find((x) => x.nome === n)._id;

  const hoje = new Date();
  const mes = (n) => mesDe(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + n, 1)));
  const dia = (n, d) => { const m = mes(n); return `${m}-${String(Math.min(d, 28)).padStart(2, '0')}T12:00:00.000Z`; };
  const hojeDia = hoje.getUTCDate();

  // recorrentes desde 2 meses atrás
  const ini = dia(-2, 1);
  for (const [tipo, descricao, valor, cat, diaDoMes] of [
    ['despesa', 'Aluguel', 850, 'Moradia', 1], ['receita', 'Salário', 2400, 'Salário', 28],
    ['despesa', 'Deutschlandticket', 58, 'Transporte', 1], ['despesa', 'Spotify', 11.99, 'Assinaturas', 15],
  ]) add('recorrentes', { tipo, descricao, valor, moeda: 'EUR', categoria: c(cat), frequencia: 'mensal', diaDoMes, inicio: ini, fim: null, ativo: true, ignoradas: [] });

  // gastos variáveis do mês atual (só até hoje) e do mês anterior
  const gastos = [
    ['Edeka', 'Mercado', 86.4, 3], ['Lidl', 'Mercado', 112.3, 9], ['Aldi', 'Mercado', 134.1, 15],
    ['Pizzaria', 'Restaurantes', 38, 4], ['Café', 'Restaurantes', 14.5, 11], ['Sushi', 'Restaurantes', 76, 17],
    ['Cinema', 'Lazer', 24, 12], ['Farmácia', 'Saúde', 18.9, 7],
  ];
  for (const [d, cat, v, dd] of gastos) {
    if (dd <= hojeDia) add('lancamentos', { tipo: 'despesa', descricao: d, valor: v, moeda: 'EUR', data: dia(0, dd), categoria: c(cat), nota: '', recorrente: null, competencia: null });
    add('lancamentos', { tipo: 'despesa', descricao: d, valor: round2(v * 0.9), moeda: 'EUR', data: dia(-1, dd), categoria: c(cat), nota: '', recorrente: null, competencia: null });
  }

  // conta de rendimento: 350 mil desde 6 meses atrás, 0,85% a.m.
  const conta = add('contas', { nome: 'Reserva', instituicao: 'Banco', moeda: 'BRL', saldoInicial: 350000, dataInicio: dia(-6, 1), modo: 'mensal', taxa: 0.85, nota: '',
    rendimentoAutomatico: true, autoDesde: dia(-6, 1), rendimentoIgnorado: [] });
  const saidas = { [-5]: [['resgate', 3000, 'Retirada'], ['imposto', 180, 'IR']], [-4]: [['resgate', 1500, 'Retirada']],
    [-3]: [['resgate', 4500, 'Viagem'], ['imposto', 210, 'IR']], [-2]: [['resgate', 2000, 'Retirada']],
    [-1]: [['resgate', 2500, 'Retirada'], ['taxa', 35, 'Tarifa']], [0]: [['resgate', 1800, 'Retirada']] };
  // as saídas; os juros de cada mês fechado entram pelo lançamento automático
  for (let n = -6; n <= -1; n++) {
    for (const [tipo, valor, descricao] of saidas[n] || []) add('movimentos', { conta: conta._id, tipo, valor, data: dia(n, 10), descricao, automatico: false });
  }
  if (hojeDia >= 10) for (const [tipo, valor, descricao] of saidas[0]) add('movimentos', { conta: conta._id, tipo, valor, data: dia(0, 10), descricao, automatico: false });

  // metas: uma conjunta com prazo, uma individual sem prazo
  const casa = add('metas', { nome: 'Casa própria', icone: '🏠', cor: '#2952eb', valorAlvo: 40000, moeda: 'EUR', prazo: dia(30, 28), pessoas: ['Eu', 'Ana'], arquivada: false });
  add('contribuicoes', { meta: casa._id, valor: 6000, data: dia(-8, 1), pessoa: 'Eu', nota: 'Saldo inicial' });
  add('contribuicoes', { meta: casa._id, valor: 4000, data: dia(-8, 1), pessoa: 'Ana', nota: 'Saldo inicial' });
  for (let n = -7; n <= 0; n++) {
    if (n === 0 && hojeDia < 5) continue;
    add('contribuicoes', { meta: casa._id, valor: 600, data: dia(n, 5), pessoa: 'Eu', nota: '' });
    add('contribuicoes', { meta: casa._id, valor: n === -3 ? 0 : 450, data: dia(n, 6), pessoa: 'Ana', nota: '' });
  }
  db.contribuicoes = db.contribuicoes.filter((c) => c.valor !== 0);
  const reserva = add('metas', { nome: 'Reserva de emergência', icone: '🛟', cor: '#0d8c54', valorAlvo: 6000, moeda: 'EUR', prazo: null, pessoas: [], arquivada: false });
  for (let n = -5; n <= -1; n++) add('contribuicoes', { meta: reserva._id, valor: 300, data: dia(n, 28), pessoa: '', nota: '' });
  add('contribuicoes', { meta: reserva._id, valor: -250, data: dia(-2, 14), pessoa: '', nota: 'Conserto da bicicleta' });
  const viagem = add('metas', { nome: 'Viagem de fim de ano', icone: '✈️', cor: '#e0672b', valorAlvo: 2500, moeda: 'EUR', prazo: dia(2, 15), pessoas: [], arquivada: false });
  add('contribuicoes', { meta: viagem._id, valor: 900, data: dia(-2, 3), pessoa: '', nota: '' });
  add('contribuicoes', { meta: viagem._id, valor: 300, data: dia(-1, 3), pessoa: '', nota: '' });
}

const metaComMetricas = (m) => ({ ...m, ...metricasMeta(m, db.contribuicoes.filter((c) => c.meta === m._id)) });

// ---------- regras ----------
function sincronizar(conta) {
  for (const mv of rendimentosAutomaticos(conta, db.movimentos.filter((x) => x.conta === conta._id))) {
    db.movimentos.push({ ...mv, _id: novoId(), data: new Date(mv.data).toISOString(), createdAt: agoraISO() });
  }
}
const sincronizarTodas = () => db.contas.forEach(sincronizar);

function gerarRecorrentes(hoje = new Date()) {
  for (const rec of db.recorrentes.filter((r) => r.ativo)) {
    const devidas = competenciasDevidas(rec, hoje).filter((m) => !rec.ignoradas?.includes(m));
    for (const m of devidas) {
      if (db.lancamentos.some((l) => l.recorrente === rec._id && l.competencia === m)) continue;
      db.lancamentos.push({
        _id: novoId(), tipo: rec.tipo, descricao: rec.descricao, valor: rec.valor, moeda: rec.moeda, categoria: rec.categoria,
        data: diaNoMes(m, rec.diaDoMes).toISOString(), recorrente: rec._id, competencia: m, nota: '', createdAt: agoraISO(),
      });
    }
  }
}

const doMes = (iso, mes) => String(iso).slice(0, 7) === mes;
const achar = (col, id) => { const d = db[col].find((x) => x._id === id); if (!d) throw new Erro(404, 'Não encontrado'); return d; };
const limpar = (obj, campos) => Object.fromEntries(campos.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

function aplicarRendimento(id, body = {}) {
  const c = achar('contas', id);
  const mes = MES_RE.test(body.mes || '') ? body.mes : mesDe(new Date());
  if (mes < mesDe(c.dataInicio)) throw new Erro(400, 'Mês anterior ao início da conta', 'mes_anterior_inicio');
  const movs = db.movimentos.filter((m) => m.conta === id);
  if (movs.some((m) => m.tipo === 'rendimento' && mesDe(m.data) === mes) && !body.forcar) throw new Erro(409, 'Já existe rendimento lançado neste mês', 'rendimento_duplicado');
  const fim = ultimoDiaDoMes(mes);
  const base = saldoAte(c, movs.filter((m) => !(m.tipo === 'rendimento' && mesDe(m.data) === mes)), fim);
  const r = taxaMensal(c);
  let valor;
  if (body.valor !== undefined && body.valor !== '') valor = round2(body.valor);
  else if (r === null) throw new Erro(400, 'Conta em modo manual: informe o valor do rendimento', 'informe_valor');
  else valor = round2(Math.max(0, base) * r);
  const mov = {
    _id: novoId(), conta: id, tipo: 'rendimento', valor, data: fim.toISOString(), automatico: false, descricao: '', createdAt: agoraISO(),
  };
  db.movimentos.push(mov);
  return { movimento: mov, base, taxaMensal: r };
}

function resumo(q) {
  gerarRecorrentes();
  sincronizarTodas();
  const mes = MES_RE.test(q.get('mes') || '') ? q.get('mes') : mesDe(new Date());
  const base = ['EUR', 'BRL', 'USD'].includes(q.get('base')) ? q.get('base') : 'EUR';
  const conv = (v, m) => converter(v, m, base);
  const lancs = db.lancamentos.filter((l) => doMes(l.data, mes));
  let receitas = 0, despesas = 0;
  const porCat = new Map(), fixo = new Map();
  for (const l of lancs) {
    const v = conv(l.valor, l.moeda);
    if (l.tipo === 'receita') receitas += v; else despesas += v;
    const k = l.categoria || 'sem';
    if (l.tipo === 'despesa') porCat.set(k, (porCat.get(k) || 0) + v);
    if (l.tipo === 'despesa' && l.recorrente) fixo.set(k, (fixo.get(k) || 0) + v);
  }
  const hoje = new Date();
  const [y, m] = mes.split('-').map(Number);
  const diasNoMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const fracao = mes < mesDe(hoje) ? 1 : mes > mesDe(hoje) ? 0 : hoje.getUTCDate() / diasNoMes;
  const orcamentos = db.categorias.filter((c) => c.tipo === 'despesa').map((c) => {
    const gasto = round2(porCat.get(c._id) || 0);
    const limite = round2(conv(c.orcamentoMensal || 0, c.moeda));
    const pct = limite > 0 ? round2((gasto / limite) * 100) : null;
    const estado = !limite ? 'sem-orcamento' : pct >= 100 ? 'estourado' : pct >= c.alertaPct ? 'alerta' : 'ok';
    const f = fixo.get(c._id) || 0;
    return {
      categoria: c._id, nome: c.nome, cor: c.cor, icone: c.icone, gasto, limite, pct, estado,
      restante: limite ? round2(limite - gasto) : null,
      ritmo: limite && fracao > 0 ? round2((gasto - f) / fracao + f) : null,
    };
  }).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  const contas = db.contas.map((c) => {
    const met = metricasConta(c, db.movimentos.filter((x) => x.conta === c._id));
    return { _id: c._id, nome: c.nome, moeda: c.moeda, saldo: met.saldoAtual, saldoBase: round2(conv(met.saldoAtual, c.moeda)), jurosMes: met.mes.juros, saidasMes: met.mes.saidas };
  });
  return {
    mes, base, cambio: { fonte: 'reserva', taxas: TAXAS },
    receitas: round2(receitas), despesas: round2(despesas), saldo: round2(receitas - despesas), quantidade: lancs.length,
    orcamentos, semCategoria: round2(porCat.get('sem') || 0),
    totalOrcado: round2(orcamentos.reduce((s, o) => s + (o.limite || 0), 0)),
    gastoOrcado: round2(orcamentos.filter((o) => o.limite).reduce((s, o) => s + o.gasto, 0)),
    fracaoDoMes: round2(fracao), contas, patrimonioContas: round2(contas.reduce((s, c) => s + c.saldoBase, 0)),
    metas: db.metas.filter((m) => !m.arquivada).map(metaComMetricas)
      .map((x) => ({ _id: x._id, nome: x.nome, icone: x.icone, cor: x.cor, moeda: x.moeda, valorAlvo: x.valorAlvo, guardado: x.guardado, pct: x.pct, estado: x.estado, prazo: x.prazo })),
  };
}

function proximaData(r) {
  if (!r.ativo) return null;
  const hoje = new Date();
  const intervalo = r.frequencia === 'anual' ? 12 : r.frequencia === 'trimestral' ? 3 : 1;
  const ini = new Date(r.inicio);
  for (let i = 0; i < 24; i++) {
    const cand = diaNoMes(mesDe(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + i, 1))), r.diaDoMes);
    const diff = (cand.getUTCFullYear() - ini.getUTCFullYear()) * 12 + cand.getUTCMonth() - ini.getUTCMonth();
    if (cand > hoje && cand >= ini && diff % intervalo === 0 && (!r.fim || cand <= new Date(r.fim))) return cand.toISOString();
  }
  return null;
}

// ---------- roteador ----------
const CAMPOS = {
  categorias: ['nome', 'tipo', 'cor', 'icone', 'orcamentoMensal', 'moeda', 'alertaPct'],
  lancamentos: ['tipo', 'descricao', 'valor', 'moeda', 'data', 'categoria', 'nota'],
  recorrentes: ['tipo', 'descricao', 'valor', 'moeda', 'categoria', 'frequencia', 'diaDoMes', 'inicio', 'fim', 'ativo'],
  contas: ['nome', 'instituicao', 'moeda', 'saldoInicial', 'dataInicio', 'modo', 'taxa', 'nota', 'rendimentoAutomatico'],
  movimentos: ['tipo', 'valor', 'data', 'descricao'],
};
const DATAS = ['data', 'inicio', 'fim', 'dataInicio'];
const normalizar = (col, body) => {
  const d = limpar(body || {}, CAMPOS[col]);
  for (const k of DATAS) if (k in d) d[k] = paraData(d[k]);
  for (const k of ['valor', 'saldoInicial']) if (k in d) d[k] = round2(d[k]);
  if ('categoria' in d && !d.categoria) d.categoria = null;
  return d;
};

function rotear(method, path, q, body) {
  const p = path.replace(/^\/api/, '').split('/').filter(Boolean);
  const [a, id, sub] = p;
  const M = method;

  if (a === 'status') return { ok: true, protegido: false };
  if (a === 'login') return { token: 'aberto', protegido: false };
  if (a === 'cambio') return { taxas: TAXAS, fonte: 'reserva' };
  if (a === 'resumo') return resumo(q);

  if (a === 'categorias') {
    if (M === 'GET') return [...db.categorias].sort((x, y) => x.tipo.localeCompare(y.tipo) || x.nome.localeCompare(y.nome));
    if (M === 'POST') { const d = { _id: novoId(), tipo: 'despesa', cor: '#7a5c3e', icone: '•', orcamentoMensal: 0, moeda: 'EUR', alertaPct: 80, ...normalizar(a, body) }; db.categorias.push(d); return d; }
    if (M === 'PUT') return Object.assign(achar(a, id), normalizar(a, body));
    if (M === 'DELETE') {
      for (const l of [...db.lancamentos, ...db.recorrentes]) if (l.categoria === id) l.categoria = null;
      db.categorias = db.categorias.filter((x) => x._id !== id); return null;
    }
  }

  if (a === 'lancamentos') {
    if (M === 'GET') {
      gerarRecorrentes();
      const mes = q.get('mes');
      return db.lancamentos.filter((l) => !mes || doMes(l.data, mes)).sort((x, y) => (y.data > x.data ? 1 : y.data < x.data ? -1 : 0));
    }
    if (M === 'POST') { const d = { _id: novoId(), recorrente: null, competencia: null, nota: '', categoria: null, ...normalizar(a, body), createdAt: agoraISO() }; db.lancamentos.push(d); return d; }
    if (M === 'PUT') return Object.assign(achar(a, id), normalizar(a, body));
    if (M === 'DELETE') {
      const l = db.lancamentos.find((x) => x._id === id);
      if (l?.recorrente && l.competencia) { const r = db.recorrentes.find((x) => x._id === l.recorrente); if (r && !r.ignoradas.includes(l.competencia)) r.ignoradas.push(l.competencia); }
      db.lancamentos = db.lancamentos.filter((x) => x._id !== id); return null;
    }
  }

  if (a === 'recorrentes') {
    if (M === 'GET') return [...db.recorrentes].sort((x, y) => (y.ativo - x.ativo) || x.diaDoMes - y.diaDoMes).map((r) => ({ ...r, proxima: proximaData(r) }));
    if (M === 'POST') { const d = { _id: novoId(), frequencia: 'mensal', diaDoMes: 1, fim: null, ativo: true, ignoradas: [], categoria: null, ...normalizar(a, body) }; db.recorrentes.push(d); gerarRecorrentes(); return d; }
    if (M === 'PUT') { const d = Object.assign(achar(a, id), normalizar(a, body)); gerarRecorrentes(); return d; }
    if (M === 'DELETE') {
      if (q.get('apagarLancamentos') === '1') db.lancamentos = db.lancamentos.filter((l) => l.recorrente !== id);
      else for (const l of db.lancamentos) if (l.recorrente === id) { l.recorrente = null; l.competencia = null; }
      db.recorrentes = db.recorrentes.filter((x) => x._id !== id); return null;
    }
  }

  if (a === 'contas') {
    if (!id) {
      if (M === 'GET') { sincronizarTodas(); } // segue para montar a lista
      if (M === 'GET') return db.contas.map((c) => {
        const m = metricasConta(c, db.movimentos.filter((x) => x.conta === c._id));
        return { ...c, saldoAtual: m.saldoAtual, jurosMes: m.mes.juros, saidasMes: m.mes.saidas, rendimentoLancado: m.mes.rendimentoLancado };
      });
      if (M === 'POST') {
        const d = { _id: novoId(), instituicao: '', moeda: 'BRL', modo: 'mensal', taxa: 0, nota: '', rendimentoAutomatico: true, rendimentoIgnorado: [], ...normalizar(a, body), createdAt: agoraISO() };
        d.autoDesde = body?.incluirAnteriores && d.dataInicio ? d.dataInicio : agoraISO();
        db.contas.push(d); sincronizar(d); return d;
      }
    }
    if (!sub) {
      if (M === 'PUT') {
        const c = achar(a, id); const d = normalizar(a, body);
        if (d.rendimentoAutomatico && !c.rendimentoAutomatico) d.autoDesde = agoraISO();
        return Object.assign(c, d);
      }
      if (M === 'DELETE') { db.movimentos = db.movimentos.filter((m) => m.conta !== id); db.contas = db.contas.filter((x) => x._id !== id); return null; }
    }
    if (sub === 'metricas') { const c = achar('contas', id); sincronizar(c); return { conta: c, ...metricasConta(c, db.movimentos.filter((x) => x.conta === id)) }; }
    if (sub === 'movimentos' && M === 'GET') return db.movimentos.filter((m) => m.conta === id).sort((x, y) => (y.data > x.data ? 1 : y.data < x.data ? -1 : 0));
    if (sub === 'movimentos' && M === 'POST') {
      const c = achar('contas', id);
      const d = normalizar('movimentos', body);
      if (SAIDAS.includes(d.tipo)) {
        const saldo = saldoAte(c, db.movimentos.filter((m) => m.conta === id), new Date(8640000000000000));
        if (d.valor > saldo) throw new Erro(400, `Saída maior que o saldo disponível (${saldo.toFixed(2)})`, 'saida_maior_saldo', { saldo, moeda: c.moeda });
      }
      const mov = { _id: novoId(), conta: id, descricao: '', automatico: false, ...d, createdAt: agoraISO() };
      db.movimentos.push(mov); return mov;
    }
    if (sub === 'aplicar-rendimento') return aplicarRendimento(id, body);
  }

  if (a === 'metas') {
    if (!id && M === 'GET') return [...db.metas].sort((x, y) => x.arquivada - y.arquivada).map(metaComMetricas);
    if (!id && M === 'POST') {
      const d = { _id: novoId(), icone: '🎯', cor: '#2952eb', moeda: 'EUR', prazo: null, pessoas: [], arquivada: false, ...limpar(body, ['nome', 'icone', 'cor', 'valorAlvo', 'moeda', 'prazo', 'pessoas']), createdAt: agoraISO() };
      d.prazo = paraData(d.prazo); d.valorAlvo = round2(d.valorAlvo);
      db.metas.push(d);
      if (Number(body.jaGuardado) > 0) db.contribuicoes.push({ _id: novoId(), meta: d._id, valor: round2(body.jaGuardado), data: agoraISO(), pessoa: '', nota: '' });
      return metaComMetricas(d);
    }
    if (id && !sub && M === 'PUT') {
      const m = achar('metas', id); const d = limpar(body, ['nome', 'icone', 'cor', 'valorAlvo', 'moeda', 'prazo', 'pessoas', 'arquivada']);
      if ('prazo' in d) d.prazo = paraData(d.prazo);
      return metaComMetricas(Object.assign(m, d));
    }
    if (id && !sub && M === 'DELETE') { db.contribuicoes = db.contribuicoes.filter((c) => c.meta !== id); db.metas = db.metas.filter((m) => m._id !== id); return null; }
    if (sub === 'contribuicoes' && M === 'GET') return db.contribuicoes.filter((c) => c.meta === id).sort((x, y) => (y.data > x.data ? 1 : y.data < x.data ? -1 : 0));
    if (sub === 'contribuicoes' && M === 'POST') {
      const m = achar('metas', id);
      const valor = round2(body.valor);
      const guardado = db.contribuicoes.filter((c) => c.meta === id).reduce((s, c) => s + c.valor, 0);
      if (valor < 0 && -valor > guardado + 0.001) throw new Erro(400, 'Retirada maior que o guardado', 'retirada_maior_guardado', { saldo: round2(guardado), moeda: m.moeda });
      db.contribuicoes.push({ _id: novoId(), meta: id, valor, data: paraData(body.data) || agoraISO(), pessoa: body.pessoa || '', nota: body.nota || '' });
      return metaComMetricas(m);
    }
  }
  if (a === 'contribuicoes' && M === 'DELETE') { db.contribuicoes = db.contribuicoes.filter((c) => c._id !== id); return null; }

  if (a === 'regras' && M === 'GET') return db.regras;
  if (a === 'importar' && id === 'previa') {
    const ja = new Set(db.lancamentos.filter((l) => l.importId).map((l) => l.importId));
    const possiveis = {};
    const tres = 3 * 86400000;
    for (const l of body.linhas) {
      if (ja.has(l.importId)) continue;
      const tm = new Date(`${l.data}T12:00:00Z`).getTime();
      const par = db.lancamentos.find((e) => !e.importId && e.tipo === l.tipo && Math.abs(e.valor - l.valor) < 0.005 && Math.abs(new Date(e.data).getTime() - tm) <= tres);
      if (par) possiveis[l.importId] = { descricao: par.descricao, data: par.data };
    }
    return { jaImportados: body.linhas.map((l) => l.importId).filter((x) => ja.has(x)), possiveis };
  }
  if (a === 'importar' && M === 'POST') {
    const ja = new Set(db.lancamentos.filter((l) => l.importId).map((l) => l.importId));
    let criados = 0;
    for (const l of body.linhas) {
      if (ja.has(l.importId)) continue;
      db.lancamentos.push({ _id: novoId(), tipo: l.tipo, descricao: l.descricao, valor: round2(l.valor), moeda: l.moeda || 'EUR', data: `${l.data}T12:00:00.000Z`,
        categoria: l.categoria || null, nota: l.nota || '', recorrente: null, competencia: null, importId: l.importId, createdAt: agoraISO() });
      ja.add(l.importId); criados++;
    }
    for (const r of body.regras || []) {
      const ex = db.regras.find((x) => x.texto === r.texto);
      if (ex) ex.categoria = r.categoria; else db.regras.push({ _id: novoId(), texto: r.texto, categoria: r.categoria });
    }
    return { criados, ignorados: body.linhas.length - criados, regras: (body.regras || []).length };
  }

  if (a === 'movimentos') {
    if (M === 'PUT') return Object.assign(achar(a, id), normalizar(a, body));
    if (M === 'DELETE') {
      const mv = db.movimentos.find((x) => x._id === id);
      if (mv?.tipo === 'rendimento') { const c = db.contas.find((x) => x._id === mv.conta); if (c && !c.rendimentoIgnorado.includes(mesDe(mv.data))) c.rendimentoIgnorado.push(mesDe(mv.data)); }
      db.movimentos = db.movimentos.filter((x) => x._id !== id); return null;
    }
  }

  throw new Erro(404, 'Rota não encontrada');
}

// ---------- intercepta fetch('/api/...') ----------
export function instalarDemo() {
  semear();
  const original = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api')) return original(input, init);
    const u = new URL(url, 'http://demo.local');
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : undefined;
    await new Promise((r) => setTimeout(r, 60)); // simula rede
    try {
      const data = rotear(method, u.pathname, u.searchParams, body);
      if (data === null) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(data), { status: method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json' } });
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      return new Response(JSON.stringify({ erro: e.message, codigo: e.codigo || (status === 500 ? 'erro_interno' : null), dados: e.dados }), { status, headers: { 'content-type': 'application/json' } });
    }
  };
}

export const restaurarExemplo = () => semear();
