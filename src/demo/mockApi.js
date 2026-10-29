// API simulada para a demonstração: roda no navegador, em memória, com os mesmos cálculos do servidor.
import {
  metricasConta, competenciasDevidas, diaNoMes, mesDe, round2, saldoAte, taxaMensal, ultimoDiaDoMes, rendimentosAutomaticos, metricasMeta, SAIDAS,
  periodoDoMes, mesFinanceiro, fracaoDoPeriodo, diaValido,
} from '../../server/finance.js';
import {
  saldoConta, resumoCartao, faturasCartao, gerarParcelas, patrimonio, seriePatrimonio, resumoViagem, relatorioAnual, lembretes, movimentosSeparados, guardadoNoMes, depositosAutomaticosDevidos, separadoViagensNoMes, sincronizarRegraSalario,
  alocacoesSalario, distribuirSalario, ordenarRegras,
} from '../../server/contas.js';
import { lerTransacaoAtalho, categoriaDoComerciante, contaDoCartao } from '../../server/applepay.js';
import { chaveRegra } from '../importacao.js';

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

const db = { categorias: [], lancamentos: [], recorrentes: [], contas: [], movimentos: [], metas: [], contribuicoes: [], regras: [], carteira: [], viagens: [], reservasViagem: [] };
let atalho = {};
let prefs = { diaInicioMes: 28 }; // na demonstração, o salário cai no dia 28
const mesFin = (d) => mesFinanceiro(d, prefs.diaInicioMes);

// ---------- dados de exemplo ----------
function semear() {
  for (const k of Object.keys(db)) db[k] = [];
  const add = (col, doc) => { const d = { _id: novoId(), createdAt: agoraISO(), updatedAt: agoraISO(), ...doc }; db[col].push(d); return d; };

  const cats = [
    ['Moradia', '🏠', '#8b5e3c', 900], ['Mercado', '🛒', '#5f7a4a', 400], ['Restaurantes', '🍽️', '#b5651d', 150],
    ['Transporte', '🚆', '#4a6378', 90], ['Saúde', '⚕️', '#7a4a5f', 0], ['Lazer', '🎭', '#9c7a2c', 120],
    ['Viagens', '✈️', '#3f7a78', 0], ['Assinaturas', '🔁', '#6b5b8a', 40], ['Educação', '📚', '#5a6b3a', 0], ['Outros', '•', '#7d7468', 0],
  ].map(([nome, icone, cor, orc]) => add('categorias', { nome, icone, cor, tipo: 'despesa', orcamentoMensal: orc, moeda: 'EUR', alertaPct: 80, dedutivel: ['Saúde', 'Educação'].includes(nome) }));
  const receitas = [['Salário', '💼', '#2f6b4f'], ['Extras', '✨', '#4f7a2f']]
    .map(([nome, icone, cor]) => add('categorias', { nome, icone, cor, tipo: 'receita', orcamentoMensal: 0, moeda: 'EUR', alertaPct: 80 }));
  const c = (n) => [...cats, ...receitas].find((x) => x.nome === n)._id;

  const hoje = new Date();
  const mes = (n) => mesDe(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + n, 1)));
  const dia = (n, d) => { const m = mes(n); return `${m}-${String(Math.min(d, 28)).padStart(2, '0')}T12:00:00.000Z`; };
  const hojeDia = hoje.getUTCDate();

  // contas do dia a dia, cartão, investimento e dívida
  const giro = add('carteira', { nome: 'Conta corrente', tipo: 'corrente', instituicao: 'Sparkasse', moeda: 'EUR', saldoInicial: 5600, dataInicio: dia(-12, 1), cor: '#2952eb', arquivada: false });
  add('carteira', { nome: 'Dinheiro', tipo: 'dinheiro', instituicao: '', moeda: 'EUR', saldoInicial: 140, dataInicio: dia(-12, 1), cor: '#0d8c54', arquivada: false });
  const cartao = add('carteira', { nome: 'Cartão Visa', tipo: 'cartao', instituicao: 'DKB', moeda: 'EUR', saldoInicial: 0, dataInicio: dia(-12, 1), cor: '#475569', arquivada: false,
    limite: 2500, diaFechamento: 20, diaVencimento: 5, contaPagamento: giro._id });
  add('carteira', { nome: 'ETF World', tipo: 'investimento', instituicao: 'Trade Republic', moeda: 'EUR', saldoInicial: 8400, dataInicio: dia(-12, 1), cor: '#8b5cf6', arquivada: false });
  const carro = add('carteira', { nome: 'Financiamento do carro', tipo: 'divida', instituicao: 'Santander', moeda: 'EUR', saldoInicial: -6900, dataInicio: dia(-12, 1), cor: '#db2777', arquivada: false });

  // recorrentes desde 2 meses atrás
  const ini = dia(-2, 1);
  for (const [tipo, descricao, valor, cat, diaDoMes] of [
    ['despesa', 'Aluguel', 850, 'Moradia', 1], ['receita', 'Salário', 2400, 'Salário', 28],
    ['despesa', 'Deutschlandticket', 58, 'Transporte', 1], ['despesa', 'Spotify', 11.99, 'Assinaturas', 15],
  ]) add('recorrentes', { tipo, descricao, valor, moeda: 'EUR', categoria: c(cat), conta: descricao === 'Spotify' ? cartao._id : giro._id, frequencia: 'mensal', diaDoMes, inicio: ini, fim: null, ativo: true, ignoradas: [] });

  // gastos variáveis do mês atual (só até hoje) e do mês anterior
  const gastos = [
    ['Edeka', 'Mercado', 86.4, 3], ['Lidl', 'Mercado', 112.3, 9], ['Aldi', 'Mercado', 134.1, 15],
    ['Pizzaria', 'Restaurantes', 38, 4], ['Café', 'Restaurantes', 14.5, 11], ['Sushi', 'Restaurantes', 76, 17],
    ['Cinema', 'Lazer', 24, 12], ['Farmácia', 'Saúde', 18.9, 7],
  ];
  for (const [d, cat, v, dd] of gastos) {
    const conta = cat === 'Restaurantes' || cat === 'Lazer' ? cartao._id : giro._id;
    if (dd <= hojeDia) add('lancamentos', { tipo: 'despesa', descricao: d, valor: v, moeda: 'EUR', data: dia(0, dd), categoria: c(cat), nota: '', recorrente: null, competencia: null, conta });
    add('lancamentos', { tipo: 'despesa', descricao: d, valor: round2(v * 0.9), moeda: 'EUR', data: dia(-1, dd), categoria: c(cat), nota: '', recorrente: null, competencia: null, conta });
  }
  add('lancamentos', { tipo: 'despesa', descricao: 'Curso online SAP FI', valor: 189, moeda: 'EUR', data: dia(-1, 8), categoria: c('Educação'), nota: 'Fatura no e-mail', recorrente: null, competencia: null, conta: cartao._id });
  // notebook em 3 parcelas no cartão
  for (const p of gerarParcelas({ tipo: 'despesa', descricao: 'Notebook', valor: 899, moeda: 'EUR', data: dia(-1, 12), categoria: c('Outros'), nota: '', conta: cartao._id }, 3, 'demo-notebook')) add('lancamentos', p);
  // parcelas do carro
  for (let n = -2; n <= 0; n++) if (n < 0 || hojeDia >= 3) add('lancamentos', { tipo: 'transferencia', descricao: 'Parcela do carro', valor: 250, moeda: 'EUR', data: dia(n, 3), conta: giro._id, contaDestino: carro._id, categoria: null, nota: '' });

  // viagem em andamento, com gastos em reais e euros
  const emDias = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return `${d.toISOString().slice(0, 10)}T12:00:00.000Z`; };
  const rio = add('viagens', { nome: 'Rio de Janeiro', icone: '🏖️', cor: '#e0672b', moeda: 'BRL', orcamento: 9000, inicio: emDias(-4), fim: emDias(6), arquivada: false });
  // € 800 separados da conta corrente para gastar no Rio (em reais, pelo câmbio do dia)
  db.reservasViagem.push({ _id: novoId(), viagem: rio._id, conta: giro._id, valor: 800, valorViagem: round2(converter(800, 'EUR', 'BRL')), data: emDias(-6), nota: '' });
  for (const [d, cat, v, m, n, reserva] of [['Voo Frankfurt–Rio', 'Viagens', 780, 'EUR', -30], ['Hotel Copacabana', 'Moradia', 2100, 'BRL', -4], ['Churrascaria', 'Restaurantes', 240, 'BRL', -3, true], ['Pão de Açúcar', 'Lazer', 190, 'BRL', -2, true], ['Uber', 'Transporte', 64, 'BRL', -1, true]]) {
    definirValorConta(add('lancamentos', { tipo: 'despesa', descricao: d, valor: v, moeda: m, data: emDias(n), categoria: c(cat), nota: '', recorrente: null, competencia: null, conta: reserva ? null : cartao._id, viagem: rio._id, reservaViagem: !!reserva }));
  }
  // faturas já vencidas ficam pagas (pagamento no dia do vencimento)
  gerarRecorrentes();
  const hojeISO = new Date().toISOString();
  for (const f of faturasCartao(cartao, db.lancamentos)) {
    if (f.restante > 0 && f.vencimento < hojeISO) add('lancamentos', { tipo: 'transferencia', descricao: 'Fatura Cartão Visa', valor: f.restante, moeda: 'EUR', data: f.vencimento, conta: giro._id, contaDestino: cartao._id, fatura: f.mes, categoria: null, nota: '' });
  }
  add('viagens', { nome: 'Lisboa', icone: '🚆', cor: '#0ea5a4', moeda: 'EUR', orcamento: 900, inicio: emDias(50), fim: emDias(55), arquivada: false });
  // Apple Pay: automação ativa e duas compras de hoje para conferir
  const agora = new Date();
  const horaAtras = (h) => new Date(agora.getTime() - h * 3600000).toISOString();
  atalho = { chave: 'demo-chave-atalho', conta: cartao._id, cartoes: { 'Visa DKB': null, 'Girocard': giro._id }, ultimos: [] };
  for (const [d, cat, v, h, cartaoNome] of [['REWE City', 'Mercado', 23.4, 3, 'Visa DKB'], ['Kowalski Laden', null, 9.9, 1, 'Visa DKB']]) {
    const conta = cartaoNome === 'Girocard' ? giro._id : cartao._id;
    add('lancamentos', { tipo: 'despesa', descricao: d, valor: v, moeda: 'EUR', data: horaAtras(h), categoria: cat ? c(cat) : null, conta, origem: 'applepay', revisar: true, nota: '', recorrente: null, competencia: null });
    atalho.ultimos.unshift({ quando: horaAtras(h), ok: true, descricao: d, valor: v, moeda: 'EUR', categoria: cat });
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
  // poupança: 300 por mês, automático no dia 2, saindo da conta corrente
  const poup = add('metas', { nome: 'Fundo livre', icone: '💰', cor: '#0d8c54', valorAlvo: 10000, moeda: 'EUR', prazo: dia(14, 28), pessoas: [], arquivada: false, tipo: 'meta', ignoradas: [], ignoradosSalario: [],
    regraSalario: { ativo: true, modo: 'excedente', valor: 0, limite: 2200, categoria: c('Salário'), conta: giro._id, desde: dia(-2, 1), ordem: 0 },
    mensal: { valor: 300, dia: 2, conta: giro._id, desde: dia(-2, 1) } });
  add('contribuicoes', { meta: poup._id, valor: 1500, data: dia(-14, 1), pessoa: '', nota: 'Saldo inicial', conta: null, valorConta: null, registro: true });
  const casa = add('metas', { nome: 'Casa própria', icone: '🏠', cor: '#2952eb', valorAlvo: 40000, moeda: 'EUR', prazo: dia(30, 28), pessoas: ['Eu', 'Ana'], arquivada: false });
  add('contribuicoes', { meta: casa._id, valor: 6000, data: dia(-14, 1), pessoa: 'Eu', nota: 'Saldo inicial', registro: true });
  add('contribuicoes', { meta: casa._id, valor: 4000, data: dia(-14, 1), pessoa: 'Ana', nota: 'Saldo inicial', registro: true });
  for (let n = -2; n <= 0; n++) {
    if (n === 0 && hojeDia < 5) continue;
    add('contribuicoes', { meta: casa._id, valor: 600, data: dia(n, 5), pessoa: 'Eu', nota: '', conta: n >= -2 ? db.carteira[0]._id : null, valorConta: null });
    add('contribuicoes', { meta: casa._id, valor: 450, data: dia(n, 6), pessoa: 'Ana', nota: '' });
  }
  db.contribuicoes = db.contribuicoes.filter((c) => c.valor !== 0);
  const reserva = add('metas', { nome: 'Reserva de emergência', icone: '🛟', cor: '#0d8c54', valorAlvo: 6000, moeda: 'EUR', prazo: null, pessoas: [], arquivada: false });
  for (let n = -2; n <= -1; n++) add('contribuicoes', { meta: reserva._id, valor: 300, data: dia(n, 28), pessoa: '', nota: '' });
  add('contribuicoes', { meta: reserva._id, valor: -250, data: dia(-2, 14), pessoa: '', nota: 'Conserto da bicicleta' });
  const viagem = add('metas', { nome: 'Viagem de fim de ano', icone: '✈️', cor: '#e0672b', valorAlvo: 2500, moeda: 'EUR', prazo: dia(2, 15), pessoas: [], arquivada: false, ignoradosSalario: [],
    regraSalario: { ativo: true, modo: 'fixo', valor: 150, limite: 0, categoria: c('Salário'), conta: null, desde: dia(-2, 1), ordem: 1 } });
  add('contribuicoes', { meta: viagem._id, valor: 900, data: dia(-2, 3), pessoa: '', nota: '' });
  add('contribuicoes', { meta: viagem._id, valor: 300, data: dia(-1, 3), pessoa: '', nota: '' });
}

const mensalDe = (b, antes) => {
  const valor = Math.max(0, round2(Number(b?.valor) || 0));
  return { valor, dia: Math.min(31, Math.max(1, Math.floor(Number(b?.dia) || 1))), conta: b?.conta || null, desde: valor > 0 ? (antes?.valor > 0 && antes?.desde ? antes.desde : agoraISO()) : null };
};
const regraDe = (b, antes) => {
  const ativo = !!b?.ativo;
  return { ativo, modo: ['excedente', 'pct', 'fixo'].includes(b?.modo) ? b.modo : 'excedente', valor: Math.max(0, round2(Number(b?.valor) || 0)), limite: Math.max(0, round2(Number(b?.limite) || 0)),
    categoria: b?.categoria || null, conta: b?.conta || null, desde: ativo ? (antes?.ativo && antes?.desde ? antes.desde : agoraISO()) : null, ordem: antes?.ordem ?? null };
};
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
        conta: rec.conta || null, data: diaNoMes(m, rec.diaDoMes).toISOString(), recorrente: rec._id, competencia: m, nota: '', createdAt: agoraISO(),
      });
    }
  }
  // depósitos automáticos mensais nas metas/poupança
  const alocado = alocacoesSalario(db.metas, db.lancamentos, (v, de, para) => converter(v, de, para));
  for (const meta of db.metas) {
    for (const d of depositosAutomaticosDevidos(meta, db.contribuicoes.filter((c) => c.meta === meta._id), hoje)) {
      const conta = db.carteira.find((c) => c._id === d.conta && ORIGENS.includes(c.tipo)) || null;
      db.contribuicoes.push({ ...d, _id: novoId(), conta: conta?._id || null, valorConta: naMoedaDaConta(conta, d.valor, meta.moeda, null) });
    }
    // distribuição do salário (Einkommensverteiler)
    if (meta.regraSalario?.ativo && !meta.arquivada) {
      const existentes = db.contribuicoes.filter((c) => c.meta === meta._id && c.salario);
      const { criar, atualizar, apagar } = sincronizarRegraSalario(meta, db.lancamentos, existentes, (v, m) => converter(v, m, meta.moeda), alocado.get(meta._id) || new Map());
      const conta = db.carteira.find((c) => c._id === meta.regraSalario.conta && ORIGENS.includes(c.tipo)) || null;
      for (const c of criar) db.contribuicoes.push({ _id: novoId(), meta: meta._id, valor: c.valor, data: c.data, salario: c.salario, conta: conta?._id || null, valorConta: naMoedaDaConta(conta, c.valor, meta.moeda, null), nota: '', pessoa: '' });
      for (const c of atualizar) Object.assign(db.contribuicoes.find((x) => x._id === c._id), { valor: c.valor, data: c.data, valorConta: naMoedaDaConta(conta, c.valor, meta.moeda, null) });
      db.contribuicoes = db.contribuicoes.filter((x) => !apagar.includes(x._id));
    } else if (!meta.regraSalario?.ativo) {
      // regra desligada: os depósitos já feitos ficam
    }
  }
}

// gasto pago com dinheiro guardado: a retirada fica ligada ao lançamento
function valorNaMeta(l, meta) { return l.moeda === meta.moeda ? round2(l.valor) : round2(converter(l.valor, l.moeda, meta.moeda)); }
function validarRetirada(l) {
  if (l.tipo !== 'despesa' || !l.meta) return;
  const meta = achar('metas', l.meta);
  const guardado = round2(db.contribuicoes.filter((c) => c.meta === meta._id && (!l._id || c.lancamento !== l._id)).reduce((s, c) => s + c.valor, 0));
  if (valorNaMeta(l, meta) > guardado + 0.004) throw new Erro(400, 'Retirada maior que o guardado', 'retirada_maior_guardado', { saldo: guardado, moeda: meta.moeda });
}
function sincronizarRetirada(l) {
  const ligada = db.contribuicoes.find((c) => c.lancamento === l._id);
  const meta = l.tipo === 'despesa' && l.meta && !l.parcela?.grupo ? db.metas.find((m) => m._id === l.meta) : null;
  if (!meta) { if (ligada) db.contribuicoes = db.contribuicoes.filter((c) => c !== ligada); return; }
  const v = valorNaMeta(l, meta);
  const outras = db.contribuicoes.filter((c) => c.meta === meta._id && c.lancamento !== l._id).sort((a, b) => (b.data > a.data ? 1 : -1));
  const emConta = outras.filter((c) => c.conta).reduce((s, c) => s + c.valor, 0);
  let conta = null;
  if (emConta >= v - 0.004) {
    const daCompra = db.carteira.find((c) => c._id === l.conta && ORIGENS.includes(c.tipo));
    conta = daCompra || db.carteira.find((c) => c._id === outras.find((x) => x.conta && x.valor > 0)?.conta) || null;
  }
  const dados = { meta: meta._id, valor: -v, data: l.data, conta: conta?._id || null, valorConta: naMoedaDaConta(conta, -v, meta.moeda, null), nota: l.descricao, lancamento: l._id, pessoa: '' };
  if (ligada) Object.assign(ligada, dados); else db.contribuicoes.push({ _id: novoId(), ...dados });
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
  const mes = MES_RE.test(q.get('mes') || '') ? q.get('mes') : mesFin(new Date());
  const base = ['EUR', 'BRL', 'USD'].includes(q.get('base')) ? q.get('base') : 'EUR';
  const conv = (v, m) => converter(v, m, base);
  const lancs = db.lancamentos.filter((l) => mesFin(l.data) === mes);
  let receitas = 0, despesas = 0, viagensMes = 0;
  const porCat = new Map(), fixo = new Map();
  for (const l of lancs) {
    if (l.tipo === 'transferencia' || l.ajuste) continue;
    const v = conv(l.valor, l.moeda);
    if (l.tipo === 'receita') receitas += v; else despesas += v;
    if (l.viagem) { viagensMes += l.tipo === 'despesa' ? v : -v; continue; }
    const k = l.categoria || 'sem';
    if (l.tipo === 'despesa') porCat.set(k, (porCat.get(k) || 0) + v);
    if (l.tipo === 'despesa' && l.recorrente) fixo.set(k, (fixo.get(k) || 0) + v);
  }
  const hoje = new Date();
  const fracao = fracaoDoPeriodo(mes, prefs.diaInicioMes, hoje);
  const periodo = periodoDoMes(mes, prefs.diaInicioMes);
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
    ...(() => { const metasMes = round2(guardadoNoMes(db.contribuicoes, db.metas, conv, mes, mesFin) + separadoViagensNoMes(db.reservasViagem, db.viagens, db.lancamentos, conv, mes, mesFin)); return { metasMes, saldo: round2(receitas - despesas - metasMes) }; })(),
    periodo: { inicio: periodo.inicio.toISOString(), fim: periodo.fim.toISOString(), dia: prefs.diaInicioMes }, viagensMes: round2(viagensMes),
    receitas: round2(receitas), despesas: round2(despesas), quantidade: lancs.length, paraRevisar: db.lancamentos.filter((l) => l.revisar).length,
    orcamentos, semCategoria: round2(porCat.get('sem') || 0),
    totalOrcado: round2(orcamentos.reduce((s, o) => s + (o.limite || 0), 0)),
    gastoOrcado: round2(orcamentos.filter((o) => o.limite).reduce((s, o) => s + o.gasto, 0)),
    fracaoDoMes: round2(fracao), contas, patrimonioContas: round2(contas.reduce((s, c) => s + c.saldoBase, 0)),
    ...(() => {
      const pat = patrimonio({ ...carteira(), conv });
      return {
        patrimonio: { ativos: pat.ativos, passivos: pat.passivos, liquido: pat.liquido }, temContas: db.carteira.length > 0,
        proximos: lembretes({ recorrentes: db.recorrentes, cartoes: db.carteira.filter((c) => c.tipo === 'cartao' && !c.arquivada), lancamentos: db.lancamentos, orcamentos: [], hoje, dias: 7 }),
      };
    })(),
    metas: db.metas.filter((m) => !m.arquivada).map(metaComMetricas)
      .map((x) => ({ _id: x._id, nome: x.nome, icone: x.icone, cor: x.cor, moeda: x.moeda, valorAlvo: x.valorAlvo, guardado: x.guardado, pct: x.pct, estado: x.estado, prazo: x.prazo, tipo: x.tipo || 'meta' })),
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

// ---------- contas, cartões, viagens ----------
const separados = () => movimentosSeparados({ contribuicoes: db.contribuicoes, metas: db.metas, reservasViagem: db.reservasViagem, viagens: db.viagens, gastosReserva: db.lancamentos.filter((l) => l.reservaViagem), contas: db.carteira });
const carteira = () => {
  const sep = separados();
  return { contas: db.carteira, lancamentos: [...db.lancamentos.filter((l) => l.conta || l.contaDestino), ...sep.lancamentos], reservas: sep.reservas, contasRend: db.contas, movsRend: db.movimentos };
};
const ORIGENS = ['corrente', 'dinheiro', 'investimento'];
const contaDeOrigem = (id) => {
  if (!id) return null;
  const c = db.carteira.find((x) => x._id === id);
  if (!c || !ORIGENS.includes(c.tipo)) throw new Erro(400, 'Escolha uma conta corrente, dinheiro ou investimento', 'conta_origem_invalida');
  return c;
};
const naMoedaDaConta = (conta, valor, moeda, informado) => (!conta || conta.moeda === moeda ? null
  : informado != null && informado !== '' ? Math.sign(valor) * Math.abs(round2(informado)) : round2(converter(valor, moeda, conta.moeda)));
const convDia = (v, de, para) => converter(v, de, para);
/** Compra em moeda diferente da conta: guarda o valor cobrado na moeda da conta */
function definirValorConta(d) {
  if (d.reservaViagem) d.conta = null;
  if (d.tipo === 'transferencia' || (!d.conta && !(d.reservaViagem && d.viagem))) { d.valorConta = null; return d; }
  const mc = d.reservaViagem ? db.viagens.find((v) => v._id === d.viagem)?.moeda : db.carteira.find((c) => c._id === d.conta)?.moeda;
  if (!mc || mc === d.moeda) d.valorConta = null;
  else if (d.valorConta == null) d.valorConta = round2(converter(d.valor, d.moeda, mc));
  return d;
}

function rotaCarteira(M, id, sub, q, body) {
  if (!id && M === 'GET') {
    sincronizarTodas(); gerarRecorrentes();
    const base = ['EUR', 'BRL', 'USD'].includes(q.get('base')) ? q.get('base') : 'EUR';
    const conv = (v, m) => converter(v, m, base);
    const dados = carteira();
    const hoje = new Date();
    const contas = db.carteira.map((c) => {
      const saldo = saldoConta(c, dados.lancamentos);
      return { ...c, saldo, saldoBase: round2(conv(saldo, c.moeda)), cartao: c.tipo === 'cartao' ? resumoCartao(c, dados.lancamentos, hoje) : undefined };
    });
    const rendimento = db.contas.map((c) => {
      const m = metricasConta(c, db.movimentos.filter((x) => x.conta === c._id));
      return { _id: c._id, nome: c.nome, instituicao: c.instituicao, moeda: c.moeda, saldo: m.saldoAtual, saldoBase: round2(conv(m.saldoAtual, c.moeda)), jurosMes: m.mes.juros };
    });
    return { base, contas, rendimento, patrimonio: patrimonio({ ...dados, conv, ate: hoje }), serie: seriePatrimonio({ ...dados, conv }, 12, hoje) };
  }
  if (!id && M === 'POST') {
    const d = { _id: novoId(), instituicao: '', moeda: 'EUR', saldoInicial: 0, cor: '#2952eb', arquivada: false, createdAt: agoraISO(), dataInicio: agoraISO(), ...normalizar('carteira', body) };
    if ((d.tipo === 'divida' || d.tipo === 'cartao') && d.saldoInicial > 0) d.saldoInicial = -d.saldoInicial;
    db.carteira.push(d); return d;
  }
  const c = achar('carteira', id);
  if (!sub && M === 'PUT') {
    const d = normalizar('carteira', body);
    const tipo = d.tipo || c.tipo;
    if ((tipo === 'divida' || tipo === 'cartao') && d.saldoInicial > 0) d.saldoInicial = -d.saldoInicial;
    return Object.assign(c, d);
  }
  if (!sub && M === 'DELETE') {
    const n = db.lancamentos.filter((l) => l.conta === id || l.contaDestino === id).length + db.contribuicoes.filter((c) => c.conta === id).length + db.reservasViagem.filter((r) => r.conta === id).length;
    if (n) throw new Erro(409, 'A conta tem lançamentos', 'conta_com_lancamentos', { n });
    for (const r of db.recorrentes) if (r.conta === id) r.conta = null;
    db.carteira = db.carteira.filter((x) => x._id !== id); return null;
  }
  const lancs = [...db.lancamentos, ...separados().lancamentos].filter((l) => l.conta === id || l.contaDestino === id);
  const dataDe = (v) => (v ? `${String(v).slice(0, 10)}T12:00:00.000Z` : agoraISO());
  if (sub === 'ajuste') {
    const data = dataDe(body?.data);
    const diferenca = round2(Number(body?.saldo) - saldoConta(c, lancs, new Date(data)));
    if (!Number.isFinite(diferenca)) throw new Erro(400, 'Informe o saldo', 'dados_invalidos');
    if (Math.abs(diferenca) < 0.005) return { diferenca: 0 };
    const l = { _id: novoId(), tipo: diferenca > 0 ? 'receita' : 'despesa', descricao: body?.descricao || 'Ajuste de saldo', valor: Math.abs(diferenca), moeda: c.moeda, data, conta: id, ajuste: true, categoria: null, nota: '', createdAt: agoraISO() };
    db.lancamentos.push(l); return { diferenca, lancamento: l };
  }
  if (sub === 'faturas') return { cartao: c, ...resumoCartao(c, lancs), faturas: faturasCartao(c, lancs) };
  if (sub === 'pagar') {
    const origem = body?.origem || c.contaPagamento;
    if (!origem) throw new Erro(400, 'Escolha a conta de onde sai o pagamento', 'escolha_origem');
    const valor = round2(body?.valor);
    if (!(valor > 0)) throw new Erro(400, 'Informe um valor', 'dados_invalidos');
    const co = db.carteira.find((x) => x._id === origem);
    const l = { _id: novoId(), tipo: 'transferencia', descricao: body?.descricao || `${c.nome} · ${body?.mes || ''}`.trim(), valor: body?.valorOrigem ? round2(body.valorOrigem) : valor,
      valorDestino: co && co.moeda !== c.moeda ? valor : null, moeda: co?.moeda || c.moeda, data: dataDe(body?.data), conta: origem, contaDestino: id,
      fatura: /^\d{4}-\d{2}$/.test(body?.mes || '') ? body.mes : null, categoria: null, nota: '', createdAt: agoraISO() };
    db.lancamentos.push(l); return l;
  }
  throw new Erro(404, 'Rota não encontrada');
}

function rotaViagens(M, id, body, sub) {
  const comResumo = (v) => ({ ...v, ...resumoViagem(v, db.lancamentos, convDia, db.categorias, new Date(), db.reservasViagem) });
  if (id && sub === 'reservas' && M === 'POST') {
    const v = achar('viagens', id);
    const valor = round2(Number(body.valor));
    if (!valor) throw new Erro(400, 'Informe um valor', 'dados_invalidos');
    const data = paraData(body.data) || agoraISO();
    let conta = null, meta = null, vMeta = 0;
    if (body.meta) {
      meta = achar('metas', body.meta);
      vMeta = v.moeda === meta.moeda ? valor : round2(converter(valor, v.moeda, meta.moeda));
      const contribs = db.contribuicoes.filter((c) => c.meta === meta._id).sort((a, b) => (b.data > a.data ? 1 : -1));
      const guardado = round2(contribs.reduce((s, c) => s + c.valor, 0));
      if (vMeta > guardado + 0.004) throw new Erro(400, 'Retirada maior que o guardado', 'retirada_maior_guardado', { saldo: guardado, moeda: meta.moeda });
      const emConta = contribs.filter((c) => c.conta).reduce((s, c) => s + c.valor, 0);
      const ultima = contribs.find((c) => c.conta && c.valor > 0)?.conta;
      if (ultima && (vMeta < 0 || emConta >= vMeta - 0.004)) conta = db.carteira.find((c) => c._id === ultima) || null;
    } else if (body.conta) {
      conta = db.carteira.find((c) => c._id === body.conta && [...ORIGENS, 'cartao'].includes(c.tipo));
      if (!conta) throw new Erro(400, 'Conta inválida', 'conta_origem_invalida');
    }
    const naConta = conta ? naMoedaDaConta(conta, valor, v.moeda, meta ? null : body.valorConta) : null;
    const r = { _id: novoId(), viagem: id, conta: conta?._id || null, meta: meta?._id || null, valor: naConta ?? valor, valorViagem: naConta == null ? null : valor, data, nota: body.nota || '' };
    db.reservasViagem.push(r);
    if (meta) db.contribuicoes.push({ _id: novoId(), meta: meta._id, valor: -vMeta, data, conta: conta?._id || null, valorConta: conta ? naMoedaDaConta(conta, -vMeta, meta.moeda, null) : null, nota: `${v.icone || '✈️'} ${v.nome}`, reservaViagem: r._id, pessoa: '' });
    return r;
  }
  if (!id && M === 'GET') return [...db.viagens].sort((x, y) => (x.arquivada - y.arquivada) || String(y.inicio || '').localeCompare(String(x.inicio || ''))).map(comResumo);
  if (!id && M === 'POST') { const d = { _id: novoId(), icone: '✈️', cor: '#e0672b', moeda: 'EUR', orcamento: 0, inicio: null, fim: null, arquivada: false, ...normalizar('viagens', body), createdAt: agoraISO() }; db.viagens.push(d); return d; }
  const v = achar('viagens', id);
  if (M === 'GET') return { ...comResumo(v), lancamentos: db.lancamentos.filter((l) => l.viagem === id).sort((x, y) => (y.data > x.data ? 1 : -1)), reservas: db.reservasViagem.filter((r) => r.viagem === id).sort((x, y) => (y.data > x.data ? 1 : -1)) };
  if (M === 'PUT') return Object.assign(v, normalizar('viagens', body));
  if (M === 'DELETE') { for (const l of db.lancamentos) if (l.viagem === id) Object.assign(l, { viagem: null, reservaViagem: false, valorConta: null }); db.reservasViagem = db.reservasViagem.filter((r) => r.viagem !== id); db.viagens = db.viagens.filter((x) => x._id !== id); return null; }
  throw new Erro(404, 'Rota não encontrada');
}

// ---------- Apple Pay (automação do Atalhos) ----------
function rotaAtalho(M, id, body) {
  if (id === 'lancamento' && M === 'POST') {
    // na demonstração, a chave vem no corpo da simulação ou vale a da configuração
    if (!atalho.chave) throw new Erro(401, 'Chave do atalho inválida', 'chave_atalho');
    const tr = lerTransacaoAtalho(body || {});
    const registrar = (item) => { atalho.ultimos = [{ quando: agoraISO(), ...item }, ...(atalho.ultimos || [])].slice(0, 10); };
    if (tr.erro) { registrar({ ok: false, erro: tr.erro, recebido: JSON.stringify(body || {}).slice(0, 200) }); throw new Erro(400, 'Valor não reconhecido', 'valor_invalido'); }
    atalho.cartoes ||= {};
    if (tr.cartao && !(tr.cartao in atalho.cartoes)) atalho.cartoes[tr.cartao] = null;
    const conta = db.carteira.find((c) => c._id === contaDoCartao(tr.cartao, atalho)) || null;
    const descricao = tr.comerciante || tr.cartao || 'Apple Pay';
    const moeda = tr.moeda || conta?.moeda || 'EUR';
    const categoria = categoriaDoComerciante(descricao, { categorias: db.categorias, regras: db.regras, historico: db.lancamentos });
    const l = definirValorConta({ _id: novoId(), tipo: tr.estorno ? 'receita' : 'despesa', descricao, valor: tr.valor, moeda, data: agoraISO(), categoria: tr.estorno ? null : categoria,
      conta: conta?._id || null, origem: 'applepay', revisar: true, nota: '', recorrente: null, competencia: null, createdAt: agoraISO() });
    db.lancamentos.push(l);
    const cat = db.categorias.find((c) => c._id === categoria);
    registrar({ ok: true, descricao, valor: tr.valor, moeda, categoria: cat?.nome || null });
    return { ok: true, texto: `${tr.valor.toFixed(2)} ${moeda} · ${descricao}${cat ? ` → ${cat.nome}` : ''}` };
  }
  if (!id && M === 'GET') return { ativo: !!atalho.chave, chave: atalho.chave || null, conta: atalho.conta || null, cartoes: atalho.cartoes || {}, ultimos: atalho.ultimos || [] };
  if (id === 'chave' && M === 'POST') { atalho.chave = `demo-${Math.random().toString(36).slice(2, 14)}`; return { chave: atalho.chave }; }
  if (!id && M === 'PUT') { if (body.conta !== undefined) atalho.conta = body.conta || null; if (body.cartoes) atalho.cartoes = body.cartoes; return { ok: true }; }
  if (!id && M === 'DELETE') { delete atalho.chave; return null; }
  throw new Erro(404, 'Rota não encontrada');
}

// ---------- roteador ----------
const CAMPOS = {
  categorias: ['nome', 'tipo', 'cor', 'icone', 'orcamentoMensal', 'moeda', 'alertaPct', 'dedutivel'],
  lancamentos: ['tipo', 'descricao', 'valor', 'moeda', 'data', 'categoria', 'nota', 'conta', 'contaDestino', 'valorDestino', 'valorConta', 'fatura', 'ajuste', 'viagem', 'reservaViagem', 'meta'],
  recorrentes: ['tipo', 'descricao', 'valor', 'moeda', 'categoria', 'conta', 'frequencia', 'diaDoMes', 'inicio', 'fim', 'ativo'],
  carteira: ['nome', 'tipo', 'instituicao', 'moeda', 'saldoInicial', 'dataInicio', 'cor', 'arquivada', 'limite', 'diaFechamento', 'diaVencimento', 'contaPagamento'],
  viagens: ['nome', 'icone', 'cor', 'moeda', 'orcamento', 'inicio', 'fim', 'arquivada'],
  contas: ['nome', 'instituicao', 'moeda', 'saldoInicial', 'dataInicio', 'modo', 'taxa', 'nota', 'rendimentoAutomatico'],
  movimentos: ['tipo', 'valor', 'data', 'descricao'],
};
const DATAS = ['data', 'inicio', 'fim', 'dataInicio'];
const normalizar = (col, body) => {
  const d = limpar(body || {}, CAMPOS[col]);
  for (const k of DATAS) if (k in d) d[k] = paraData(d[k]);
  for (const k of ['valor', 'saldoInicial', 'limite', 'orcamento']) if (k in d) d[k] = round2(d[k]);
  if ('valorConta' in d) d.valorConta = d.valorConta === null || d.valorConta === '' ? null : round2(d.valorConta);
  if ('valorDestino' in d) d.valorDestino = d.valorDestino === null || d.valorDestino === '' ? null : round2(d.valorDestino);
  for (const k of ['categoria', 'conta', 'contaDestino', 'viagem', 'contaPagamento', 'fatura', 'meta']) if (k in d && !d[k]) d[k] = null;
  if (col === 'lancamentos') {
    if (d.tipo === 'transferencia') { d.categoria = null; d.viagem = null; }
    else if (d.tipo) { d.contaDestino = null; d.valorDestino = null; d.fatura = null; }
    if (d.tipo === 'transferencia' && (!d.conta || !d.contaDestino || d.conta === d.contaDestino)) throw new Erro(400, 'Escolha as duas contas da transferência', 'transferencia_contas');
  }
  return d;
};

function rotear(method, path, q, body) {
  const p = path.replace(/^\/api/, '').split('/').filter(Boolean);
  const [a, id, sub] = p;
  const M = method;

  if (a === 'status') return { ok: true, protegido: false };
  if (a === 'atalho') return rotaAtalho(M, id, body);
  if (a === 'preferencias') { if (M === 'PUT' && body.diaInicioMes !== undefined) prefs.diaInicioMes = diaValido(body.diaInicioMes); return { diaInicioMes: prefs.diaInicioMes }; }
  if (a === 'distribuicao' && M === 'PUT') { (body.ids || []).forEach((mid, i) => { const m = db.metas.find((x) => x._id === mid); if (m?.regraSalario) m.regraSalario.ordem = i; }); gerarRecorrentes(); return { ok: true }; }
  if (a === 'distribuicao') {
    const metas = db.metas.filter((m) => !m.arquivada);
    const ordem = ordenarRegras(metas);
    const cat = ordem[0]?.regraSalario?.categoria;
    const ultimo = cat ? db.lancamentos.filter((l) => l.tipo === 'receita' && l.categoria === cat).sort((x, y) => (y.data > x.data ? 1 : -1))[0] : null;
    const exemplo = Number(q.get('salario')) || ultimo?.valor || 0;
    const { partes, total, livre } = distribuirSalario(exemplo, ordem.map((m) => ({ id: m._id, regra: m.regraSalario })));
    const mensais = metas.filter((m) => m.mensal?.valor > 0).map((m) => ({ _id: m._id, nome: m.nome, icone: m.icone, valor: m.mensal.valor, dia: m.mensal.dia, moeda: m.moeda }));
    const totalMensais = round2(mensais.reduce((s, m) => s + m.valor, 0));
    return { salario: ultimo ? { valor: ultimo.valor, moeda: ultimo.moeda, data: ultimo.data, descricao: ultimo.descricao } : null, exemplo,
      regras: ordem.map((m, i) => ({ _id: m._id, nome: m.nome, icone: m.icone, cor: m.cor, moeda: m.moeda, regra: m.regraSalario, ...partes[i] })), total, livre, mensais, totalMensais, sobra: round2(livre - totalMensais) };
  }
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

  if (a === 'lancamentos' && sub === 'conferir') { const l = achar('lancamentos', id); l.revisar = false; return { ok: true }; }
  if (a === 'lancamentos') {
    if (M === 'GET') {
      gerarRecorrentes();
      const mes = q.get('mes'), conta = q.get('conta'), viagem = q.get('viagem'), cat = q.get('categoria'), revisar = q.get('revisar') === '1';
      return [...db.lancamentos, ...(conta ? separados().lancamentos : [])].filter((l) => (!revisar || l.revisar) && (!mes || mesFin(l.data) === mes) && (!conta || l.conta === conta || l.contaDestino === conta) && (!viagem || l.viagem === viagem) && (!cat || l.categoria === cat)).sort((x, y) => (y.data > x.data ? 1 : y.data < x.data ? -1 : 0));
    }
    if (M === 'POST') {
      const dados = definirValorConta(normalizar(a, body));
      const n = Math.floor(Number(body?.parcelas) || 1);
      if (n > 1 || dados.tipo !== 'despesa') dados.meta = null;
      validarRetirada(dados);
      const docs = n > 1 && dados.tipo === 'despesa' ? gerarParcelas(dados, n, novoId()) : [dados];
      const criados = docs.map((x) => ({ _id: novoId(), recorrente: null, competencia: null, nota: '', categoria: null, ...x, createdAt: agoraISO() }));
      db.lancamentos.push(...criados); sincronizarRetirada(criados[0]); gerarRecorrentes(); return criados[0];
    }
    if (M === 'PUT') {
      const l = achar(a, id); const d = normalizar(a, body); const junto = definirValorConta({ ...l, ...d });
      d.revisar = false;
      if (l.origem === 'applepay' && d.categoria && d.categoria !== l.categoria) {
        const texto = chaveRegra(d.descricao || l.descricao);
        const ex = db.regras.find((r) => r.texto === texto);
        if (ex) ex.categoria = d.categoria; else if (texto.length >= 3) db.regras.push({ _id: novoId(), texto, categoria: d.categoria });
      }
      if (junto.tipo !== 'despesa') d.meta = null;
      validarRetirada({ ...junto, ...('meta' in d ? { meta: d.meta } : {}) });
      Object.assign(l, d, { valorConta: junto.valorConta }); sincronizarRetirada(l); gerarRecorrentes(); return l;
    }
    if (M === 'DELETE') {
      const l = db.lancamentos.find((x) => x._id === id);
      if (l?.recorrente && l.competencia) { const r = db.recorrentes.find((x) => x._id === l.recorrente); if (r && !r.ignoradas.includes(l.competencia)) r.ignoradas.push(l.competencia); }
      db.contribuicoes = db.contribuicoes.filter((c) => c.lancamento !== id && c.salario !== id);
      db.lancamentos = db.lancamentos.filter((x) => x._id !== id && !(q.get('todas') === '1' && l?.parcela?.grupo && x.parcela?.grupo === l.parcela.grupo)); return null;
    }
  }

  if (a === 'carteira') return rotaCarteira(M, id, sub, q, body);
  if (a === 'viagens') return rotaViagens(M, id, body, sub);
  if (a === 'relatorio') {
    gerarRecorrentes(); sincronizarTodas();
    const ano = /^\d{4}$/.test(q.get('ano') || '') ? Number(q.get('ano')) : new Date().getUTCFullYear();
    const base = ['EUR', 'BRL', 'USD'].includes(q.get('base')) ? q.get('base') : 'EUR';
    const doAno = (d) => new Date(d).getUTCFullYear() === ano;
    const atual = new Date().getUTCFullYear();
    return { base, anos: [atual, atual - 1], ...relatorioAnual({ ano, lancamentos: db.lancamentos.filter((l) => doAno(l.data)), categorias: db.categorias, movsRend: db.movimentos.filter((m) => doAno(m.data)), contasRend: db.contas, contribuicoes: db.contribuicoes, metas: db.metas, reservasViagem: db.reservasViagem, viagens: db.viagens, conv: (v, m) => converter(v, m, base) }) };
  }
  if (a === 'lembretes') return lembretes({ recorrentes: db.recorrentes, cartoes: db.carteira.filter((c) => c.tipo === 'cartao' && !c.arquivada), lancamentos: db.lancamentos, hoje: new Date(), dias: Number(q.get('dias')) || 7 });
  if (a === 'push') throw new Erro(400, 'Indisponível na demonstração');

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
    if (!id && M === 'GET') { gerarRecorrentes(); return [...db.metas].sort((x, y) => (x.arquivada - y.arquivada) || ((y.tipo === 'poupanca') - (x.tipo === 'poupanca'))).map(metaComMetricas); }
    if (!id && M === 'POST') {
      const d = { _id: novoId(), icone: '🎯', cor: '#2952eb', moeda: 'EUR', prazo: null, pessoas: [], arquivada: false, ...limpar(body, ['nome', 'icone', 'cor', 'valorAlvo', 'moeda', 'prazo', 'pessoas']), tipo: 'meta', ignoradas: [], ignoradosSalario: [], mensal: mensalDe(body.mensal, null), regraSalario: regraDe(body.regraSalario, null), createdAt: agoraISO() };
      d.prazo = paraData(d.prazo); d.valorAlvo = round2(d.valorAlvo);
      db.metas.push(d);
      if (Number(body.jaGuardado) > 0) db.contribuicoes.push({ _id: novoId(), meta: d._id, valor: round2(body.jaGuardado), data: agoraISO(), pessoa: '', nota: '', registro: true });
      return metaComMetricas(d);
    }
    if (id && !sub && M === 'PUT') {
      const m = achar('metas', id); const d = limpar(body, ['nome', 'icone', 'cor', 'valorAlvo', 'moeda', 'prazo', 'pessoas', 'arquivada']);
      if ('prazo' in d) d.prazo = paraData(d.prazo);
      if (body.mensal !== undefined) d.mensal = mensalDe(body.mensal, m.mensal);
      if (body.regraSalario !== undefined) {
        if (body.regraSalario?.ativo && !body.regraSalario.categoria) throw new Erro(400, 'Escolha a categoria do salário', 'categoria_salario');
        d.regraSalario = regraDe(body.regraSalario, m.regraSalario);
      }
      Object.assign(m, d); gerarRecorrentes();
      return metaComMetricas(m);
    }
    if (id && !sub && M === 'DELETE') { for (const l of db.lancamentos) if (l.meta === id) l.meta = null; db.contribuicoes = db.contribuicoes.filter((c) => c.meta !== id); db.metas = db.metas.filter((m) => m._id !== id); return null; }
    if (sub === 'contribuicoes' && M === 'GET') return db.contribuicoes.filter((c) => c.meta === id).sort((x, y) => (y.data > x.data ? 1 : y.data < x.data ? -1 : 0));
    if (sub === 'contribuicoes' && M === 'POST') {
      const m = achar('metas', id);
      const valor = round2(body.valor);
      const guardado = db.contribuicoes.filter((c) => c.meta === id).reduce((s, c) => s + c.valor, 0);
      if (valor < 0 && -valor > guardado + 0.001) throw new Erro(400, 'Retirada maior que o guardado', 'retirada_maior_guardado', { saldo: round2(guardado), moeda: m.moeda });
      const conta = body.registro ? null : contaDeOrigem(body.conta || null);
      db.contribuicoes.push({ _id: novoId(), meta: id, valor, data: paraData(body.data) || agoraISO(), pessoa: body.pessoa || '', nota: body.nota || '', registro: !!body.registro, conta: conta?._id || null, valorConta: naMoedaDaConta(conta, valor, m.moeda, body.valorConta) });
      return metaComMetricas(m);
    }
  }
  if (a === 'reservas-viagem' && M === 'DELETE') { db.reservasViagem = db.reservasViagem.filter((r) => r._id !== id); db.contribuicoes = db.contribuicoes.filter((c) => c.reservaViagem !== id); return null; }
  if (a === 'contribuicoes' && M === 'PUT') {
    const c = achar('contribuicoes', id);
    if ('registro' in body && !(c.lancamento || c.reservaViagem || c.salario || c.automatica)) {
      c.registro = !!body.registro;
      if (c.registro) { c.conta = null; c.valorConta = null; }
    }
    return c;
  }
  if (a === 'contribuicoes' && M === 'DELETE') {
    const c = db.contribuicoes.find((x) => x._id === id);
    if (c?.valor > 0) {
      const total = db.contribuicoes.filter((x) => x.meta === c.meta).reduce((s, x) => s + x.valor, 0);
      if (total - c.valor < -0.004) throw new Erro(400, 'Esse dinheiro já foi usado', 'guardado_negativo', { saldo: round2(total) });
    }
    if (c?.automatica && c.competencia) { const m = db.metas.find((x) => x._id === c.meta); if (m) { m.ignoradas ||= []; if (!m.ignoradas.includes(c.competencia)) m.ignoradas.push(c.competencia); } }
    if (c?.lancamento) { const l = db.lancamentos.find((x) => x._id === c.lancamento); if (l) l.meta = null; }
    if (c?.salario) { const m = db.metas.find((x) => x._id === c.meta); if (m) { m.ignoradosSalario ||= []; m.ignoradosSalario.push(String(c.salario)); } }
    if (c?.reservaViagem) db.reservasViagem = db.reservasViagem.filter((r) => r._id !== c.reservaViagem);
    db.contribuicoes = db.contribuicoes.filter((x) => x._id !== id); return null;
  }

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
    const contaImp = body.conta || null;
    const ja = new Set(db.lancamentos.filter((l) => l.importId).map((l) => l.importId));
    let criados = 0;
    for (const l of body.linhas) {
      if (ja.has(l.importId)) continue;
      db.lancamentos.push({ _id: novoId(), tipo: l.tipo, descricao: l.descricao, valor: round2(l.valor), moeda: l.moeda || 'EUR', data: `${l.data}T12:00:00.000Z`,
        categoria: l.categoria || null, nota: l.nota || '', recorrente: null, competencia: null, importId: l.importId, conta: contaImp, createdAt: agoraISO() });
      definirValorConta(db.lancamentos.at(-1));
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
