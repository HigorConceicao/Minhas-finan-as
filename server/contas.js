// Contas, cartões, patrimônio, viagens, relatório anual e lembretes — funções puras
// (sem banco de dados), usadas pelo servidor e pela demonstração.
import { diaNoMes, mesDe, mesesEntre, proximoMes, round2, metricasConta, competenciasDevidas } from './finance.js';

export const TIPOS_CONTA = ['corrente', 'dinheiro', 'investimento', 'divida', 'cartao'];
const idDe = (x) => (x == null ? null : String(x._id ?? x));
const t = (d) => new Date(d).getTime();
const diaISO = (d) => new Date(d).toISOString().slice(0, 10);

/** Valor na moeda da conta (compra em outra moeda guarda o valor cobrado em `valorConta`) */
export const valorNaConta = (l) => Number(l.valorConta ?? l.valor);

/** O quanto um lançamento muda o saldo de uma conta */
export function efeitoNaConta(l, contaId) {
  const id = String(contaId);
  if (l.tipo === 'transferencia') {
    let e = 0;
    if (idDe(l.conta) === id) e -= Number(l.valor);
    if (idDe(l.contaDestino) === id) e += Number(l.valorDestino ?? l.valor);
    return e;
  }
  if (idDe(l.conta) !== id) return 0;
  const v = valorNaConta(l);
  return l.tipo === 'receita' ? v : -v;
}

/** Saldo de uma conta numa data (inclusive). Dívidas e cartões ficam negativos. */
export function saldoConta(conta, lancamentos, ate = new Date(8640000000000000)) {
  const inicio = conta.dataInicio ? t(conta.dataInicio) : -Infinity;
  const limite = t(ate);
  let s = Number(conta.saldoInicial || 0);
  for (const l of lancamentos) {
    const tl = t(l.data);
    if (tl < inicio || tl > limite) continue;
    s += efeitoNaConta(l, conta._id);
  }
  return round2(s);
}

// ---------- cartão de crédito ----------

/** Em que fatura ('AAAA-MM') cai uma compra: depois do fechamento vai para a do mês seguinte */
export const faturaDaCompra = (data, diaFechamento) => {
  const d = new Date(data);
  const m = mesDe(d);
  const fechamento = diaNoMes(m, diaFechamento);
  return d.getUTCDate() > fechamento.getUTCDate() ? proximoMes(m) : m;
};
export const fechamentoDaFatura = (mes, diaFechamento) => diaNoMes(mes, diaFechamento);
/** Vencimento: no mesmo mês se o dia vem depois do fechamento; senão no mês seguinte */
export const vencimentoDaFatura = (mes, diaFechamento, diaVencimento) =>
  diaNoMes(diaVencimento > diaFechamento ? mes : proximoMes(mes), diaVencimento);

/**
 * Faturas de um cartão. Compras e estornos entram pela data; pagamentos (transferências para o cartão)
 * quitam a fatura indicada em `fatura` ou, sem indicação, a mais antiga em aberto.
 */
export function faturasCartao(cartao, lancamentos, hoje = new Date()) {
  const id = idDe(cartao);
  const fech = Number(cartao.diaFechamento || 1), venc = Number(cartao.diaVencimento || 10);
  const porMes = new Map();
  const garantir = (m) => {
    if (!porMes.has(m)) porMes.set(m, { mes: m, compras: 0, estornos: 0, pago: 0, itens: [] });
    return porMes.get(m);
  };
  const pagamentos = [];
  for (const l of lancamentos) {
    if (l.tipo === 'transferencia' && idDe(l.contaDestino) === id) { pagamentos.push(l); continue; }
    if (idDe(l.conta) !== id) continue;
    const f = garantir(faturaDaCompra(l.data, fech));
    // dinheiro tirado do cartão (ex.: separado para uma viagem) entra na fatura como compra
    if (l.tipo === 'despesa' || l.tipo === 'transferencia') f.compras += l.tipo === 'transferencia' ? Number(l.valor) : valorNaConta(l); else f.estornos += valorNaConta(l);
    f.itens.push(l);
  }
  // saldo inicial do cartão (negativo = já devia algo) entra na fatura do mês de início
  if (Number(cartao.saldoInicial) < 0 && cartao.dataInicio) garantir(faturaDaCompra(cartao.dataInicio, fech)).compras += -Number(cartao.saldoInicial);

  const ordenadas = [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  const total = (f) => round2(f.compras - f.estornos);
  // pagamentos com fatura indicada primeiro; os demais quitam a mais antiga em aberto
  for (const p of pagamentos.filter((p) => p.fatura)) garantir(p.fatura).pago += Number(p.valorDestino ?? p.valor);
  for (const p of pagamentos.filter((p) => !p.fatura).sort((a, b) => t(a.data) - t(b.data))) {
    let resta = Number(p.valorDestino ?? p.valor);
    for (const f of [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes))) {
      if (resta <= 0) break;
      const falta = total(f) - f.pago;
      if (falta <= 0.004) continue;
      const usa = Math.min(falta, resta);
      f.pago += usa; resta -= usa;
    }
    if (resta > 0.004 && ordenadas.length) ordenadas.at(-1).pago += resta; // pagamento a mais vira crédito
  }

  const agora = t(hoje);
  return [...porMes.values()].sort((a, b) => b.mes.localeCompare(a.mes)).map((f) => {
    const fechamento = fechamentoDaFatura(f.mes, fech);
    const vencimento = vencimentoDaFatura(f.mes, fech, venc);
    const tot = total(f);
    const restante = round2(Math.max(0, tot - f.pago));
    const estado = restante <= 0.004 && tot > 0 ? 'paga'
      : agora <= t(fechamento) + 43200000 ? 'aberta' // até o fim do dia do fechamento
      : agora <= t(vencimento) + 43200000 ? 'fechada'
      : 'vencida';
    return {
      mes: f.mes, fechamento: fechamento.toISOString(), vencimento: vencimento.toISOString(),
      total: tot, pago: round2(f.pago), restante, estado: tot <= 0 && f.pago <= 0 ? 'vazia' : estado,
      quantidade: f.itens.length, itens: f.itens.sort((a, b) => t(b.data) - t(a.data)),
    };
  });
}

/** Resumo de um cartão: limite usado (inclui parcelas futuras), disponível e a fatura atual */
export function resumoCartao(cartao, lancamentos, hoje = new Date()) {
  const faturas = faturasCartao(cartao, lancamentos, hoje);
  const usado = round2(faturas.reduce((s, f) => s + f.restante, 0));
  const limite = Number(cartao.limite || 0);
  const mesAtual = faturaDaCompra(hoje, Number(cartao.diaFechamento || 1));
  const atual = faturas.find((f) => f.mes === mesAtual) || null;
  const aPagar = faturas.filter((f) => f.estado === 'fechada' || f.estado === 'vencida').sort((a, b) => a.mes.localeCompare(b.mes))[0] || null;
  return {
    limite, usado, disponivel: limite ? round2(limite - usado) : null, pctUsado: limite ? round2((usado / limite) * 100) : null,
    faturaAtual: atual && { ...atual, itens: undefined }, proximaAPagar: aPagar && { ...aPagar, itens: undefined },
    faturas: faturas.map((f) => ({ ...f, itens: undefined })),
  };
}

/** Divide uma compra parcelada em lançamentos mensais (centavos que sobram vão na 1ª parcela) */
export function gerarParcelas(base, parcelas, grupo) {
  const n = Math.max(1, Math.min(48, Math.floor(parcelas)));
  const total = Math.round(Number(base.valor) * 100);
  const cada = Math.floor(total / n);
  const primeira = total - cada * (n - 1);
  const d0 = new Date(base.data);
  const vc = base.valorConta != null ? Math.round(Number(base.valorConta) * 100) : null;
  const vcCada = vc != null ? Math.floor(vc / n) : null;
  return Array.from({ length: n }, (_, i) => {
    const m = mesDe(new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + i, 1)));
    return {
      ...base, valor: (i === 0 ? primeira : cada) / 100, ...(vc != null ? { valorConta: (i === 0 ? vc - vcCada * (n - 1) : vcCada) / 100 } : {}), data: diaNoMes(m, d0.getUTCDate()).toISOString(),
      parcela: { numero: i + 1, total: n, grupo, valorTotal: total / 100 },
    };
  });
}

// ---------- patrimônio ----------

/**
 * Patrimônio numa data: contas (convertidas para a moeda base) + contas de rendimento.
 * `conv(valor, moeda)` converte para a moeda base.
 */
export function patrimonio({ contas, lancamentos, contasRend = [], movsRend = [], reservas = [], conv, ate = new Date() }) {
  const porTipo = { corrente: 0, dinheiro: 0, investimento: 0, rendimento: 0, divida: 0, cartao: 0, separado: 0 };
  const itens = [];
  for (const c of contas.filter((x) => !x.arquivada)) {
    if (c.dataInicio && t(c.dataInicio) > t(ate)) continue; // a conta ainda não existia
    const s = saldoConta(c, lancamentos, ate);
    const b = round2(conv(s, c.moeda));
    porTipo[c.tipo] = round2((porTipo[c.tipo] || 0) + b);
    itens.push({ _id: c._id, nome: c.nome, tipo: c.tipo, moeda: c.moeda, saldo: s, saldoBase: b });
  }
  for (const c of contasRend) {
    if (t(c.dataInicio) > t(ate)) continue;
    const movs = movsRend.filter((m) => idDe(m.conta) === idDe(c) && t(m.data) <= t(ate));
    const s = metricasConta(c, movs, ate).saldoAtual;
    const b = round2(conv(s, c.moeda));
    porTipo.rendimento = round2(porTipo.rendimento + b);
    itens.push({ _id: c._id, nome: c.nome, tipo: 'rendimento', moeda: c.moeda, saldo: s, saldoBase: b });
  }
  const sep = new Map();
  for (const r of reservas) {
    if (t(r.data) > t(ate)) continue;
    if (!sep.has(r.chave)) sep.set(r.chave, { _id: r.ref, nome: r.nome, icone: r.icone, tipo: 'separado', origem: r.tipo, moeda: r.moeda, saldo: 0 });
    sep.get(r.chave).saldo += r.valor;
  }
  for (const r of sep.values()) {
    r.saldo = round2(r.saldo);
    if (Math.abs(r.saldo) < 0.005) continue;
    r.saldoBase = round2(conv(r.saldo, r.moeda));
    porTipo.separado = round2(porTipo.separado + r.saldoBase);
    itens.push(r);
  }
  const ativos = round2(itens.filter((i) => i.saldoBase > 0).reduce((s, i) => s + i.saldoBase, 0));
  const passivos = round2(-itens.filter((i) => i.saldoBase < 0).reduce((s, i) => s + i.saldoBase, 0));
  return { ativos, passivos, liquido: round2(ativos - passivos), porTipo, itens };
}

/** Patrimônio no fim de cada um dos últimos `n` meses */
export function seriePatrimonio(args, n = 12, hoje = new Date()) {
  const fim = mesDe(hoje);
  let ini = fim;
  for (let i = 1; i < n; i++) { const [y, m] = ini.split('-').map(Number); ini = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; }
  return mesesEntre(ini, fim).map((m) => {
    const [y, mo] = m.split('-').map(Number);
    const ate = m === fim ? hoje : new Date(Date.UTC(y, mo, 0, 23, 59, 59));
    const p = patrimonio({ ...args, ate });
    return { mes: m, liquido: p.liquido, ativos: p.ativos, passivos: p.passivos };
  });
}

// ---------- viagens ----------

/**
 * Situação de uma viagem: gastos (convertidos para a moeda da viagem no câmbio de cada dia),
 * por categoria e por moeda, quanto sobra e se passou do orçamento.
 * `convNaData(valor, de, para, dataISO)` converte usando o câmbio daquele dia.
 */
export function resumoViagem(viagem, lancamentos, convNaData, categorias = [], hoje = new Date(), reservas = []) {
  const id = idDe(viagem);
  const daViagem = lancamentos.filter((l) => idDe(l.viagem) === id && l.tipo !== 'transferencia');
  let gasto = 0;
  const porCategoria = new Map(), porMoeda = new Map();
  for (const l of daViagem) {
    const sinal = l.tipo === 'receita' ? -1 : 1; // reembolsos abatem
    const v = convNaData(Number(l.valor), l.moeda, viagem.moeda, diaISO(l.data)) * sinal;
    gasto += v;
    const k = idDe(l.categoria) || 'sem';
    porCategoria.set(k, (porCategoria.get(k) || 0) + v);
    porMoeda.set(l.moeda, (porMoeda.get(l.moeda) || 0) + Number(l.valor) * sinal);
  }
  const orc = Number(viagem.orcamento || 0);
  const pct = orc > 0 ? round2((gasto / orc) * 100) : null;
  const ini = viagem.inicio ? t(viagem.inicio) : null, fim = viagem.fim ? t(viagem.fim) : null;
  const agora = t(hoje);
  const fase = ini && agora < ini ? 'futura' : fim && agora > fim + 86400000 ? 'encerrada' : 'em-andamento';
  const dias = ini && fim ? Math.max(1, Math.round((fim - ini) / 86400000) + 1) : null;
  const diasPassados = ini && fim ? Math.min(dias, Math.max(0, Math.floor((agora - ini) / 86400000) + 1)) : null;
  const catNome = new Map(categorias.map((c) => [idDe(c), c]));
  return {
    gasto: round2(gasto), orcamento: orc, restante: orc ? round2(orc - gasto) : null, pct,
    estado: !orc ? 'sem-orcamento' : pct >= 100 ? 'estourado' : pct >= 80 ? 'alerta' : 'ok',
    fase, dias, diasPassados,
    porDiaRestante: orc && fase !== 'encerrada' && dias && diasPassados != null && dias - diasPassados > 0 ? round2(Math.max(0, orc - gasto) / (dias - diasPassados + (fase === 'futura' ? 0 : 1))) : null,
    porCategoria: [...porCategoria.entries()].map(([k, v]) => ({ categoria: k === 'sem' ? null : k, nome: catNome.get(k)?.nome || null, icone: catNome.get(k)?.icone || '•', cor: catNome.get(k)?.cor || '#8a92a3', valor: round2(v) })).sort((a, b) => b.valor - a.valor),
    porMoeda: [...porMoeda.entries()].map(([moeda, v]) => ({ moeda, valor: round2(v) })),
    quantidade: daViagem.length,
    ...reservaDaViagem(viagem, reservas, daViagem),
  };
}

/**
 * Dinheiro separado para a viagem: o que saiu das contas (na moeda da viagem),
 * menos os gastos pagos com esse dinheiro (`reservaViagem`), mais nada do resto.
 */
export function reservaDaViagem(viagem, reservas, gastos) {
  const id = idDe(viagem);
  const minhas = reservas.filter((r) => idDe(r.viagem) === id);
  const reservado = round2(minhas.reduce((s, r) => s + Number(r.valorViagem ?? r.valor), 0));
  const gastoReserva = round2(gastos.filter((l) => l.reservaViagem && idDe(l.viagem) === id)
    .reduce((s, l) => s + (l.tipo === 'receita' ? -1 : 1) * Number(l.valorConta ?? l.valor), 0));
  return { reservado, gastoReserva, saldoReserva: round2(reservado - gastoReserva), temReserva: minhas.length > 0 };
}

// ---------- dinheiro separado (metas e viagens) ----------

/**
 * Depósitos em metas e dinheiro separado para viagens que saíram de uma conta.
 * Viram "transferências" para fora da conta (o saldo da conta cai) e entram no patrimônio
 * como dinheiro separado, para o patrimônio não mudar com a separação.
 * Devolve `lancamentos` (para os saldos das contas) e `reservas` (entradas para o patrimônio).
 */
export function movimentosSeparados({ contribuicoes = [], metas = [], reservasViagem = [], viagens = [], gastosReserva = [], contas = [] }) {
  const lancamentos = [], reservas = [];
  const moedaConta = new Map(contas.map((c) => [idDe(c), c.moeda]));
  const metaDe = new Map(metas.map((m) => [idDe(m), m]));
  const viagemDe = new Map(viagens.map((v) => [idDe(v), v]));
  const sair = (origem, x, alvo, tipo, valorAlvo, moedaAlvo) => {
    const conta = idDe(x.conta);
    const naConta = Number(x.valorConta ?? x.valor);
    const base = { _id: `sep-${idDe(x)}`, tipo: 'transferencia', separado: tipo, ref: idDe(alvo), descricao: alvo.nome, data: x.data, moeda: moedaConta.get(conta) || moedaAlvo, nota: x.nota || '' };
    if (naConta >= 0) lancamentos.push({ ...base, conta, contaDestino: null, valor: round2(naConta) });
    else lancamentos.push({ ...base, conta: null, contaDestino: conta, valor: round2(-naConta) });
    reservas.push({ chave: `${tipo}:${idDe(alvo)}`, ref: idDe(alvo), tipo, nome: alvo.nome, icone: alvo.icone, moeda: moedaAlvo, data: x.data, valor: Number(valorAlvo) });
  };
  for (const c of contribuicoes) {
    const m = metaDe.get(idDe(c.meta));
    if (!c.conta || !m) continue;
    sair('meta', c, m, 'meta', c.valor, m.moeda);
  }
  for (const r of reservasViagem) {
    const v = viagemDe.get(idDe(r.viagem));
    if (!r.conta || !v) continue;
    sair('viagem', r, v, 'viagem', r.valorViagem ?? r.valor, v.moeda);
  }
  // gastos pagos com o dinheiro separado diminuem a reserva; no patrimônio só entra a parte que saiu
  // de contas (o que veio do saldo do mês não estava em nenhuma conta cadastrada)
  const proporcao = new Map();
  for (const r of reservasViagem) {
    const k = idDe(r.viagem), v = Number(r.valorViagem ?? r.valor);
    const p = proporcao.get(k) || { conta: 0, total: 0 };
    p.total += v; if (r.conta) p.conta += v;
    proporcao.set(k, p);
  }
  for (const l of gastosReserva) {
    const v = viagemDe.get(idDe(l.viagem));
    const p = proporcao.get(idDe(l.viagem));
    if (!l.reservaViagem || !v || !p || p.total <= 0 || p.conta <= 0) continue;
    const fator = Math.min(1, p.conta / p.total);
    reservas.push({ chave: `viagem:${idDe(v)}`, ref: idDe(v), tipo: 'viagem', nome: v.nome, icone: v.icone, moeda: v.moeda, data: l.data, valor: (l.tipo === 'receita' ? 1 : -1) * Number(l.valorConta ?? l.valor) * fator });
  }
  return { lancamentos, reservas };
}

// ---------- relatório anual ----------

/**
 * Ano inteiro na moeda base: entradas, saídas e rendimentos mês a mês, totais por categoria
 * (com o mês a mês de cada uma) e as despesas de categorias marcadas como dedutíveis.
 * Transferências e ajustes de saldo não contam como entrada nem saída.
 */
/**
 * Quanto foi guardado nas metas num mês (depósitos menos retiradas), na moeda base.
 * Sai do saldo do mês: dinheiro guardado não está mais livre para gastar.
 */
export function guardadoNoMes(contribuicoes, metas, conv, mes) {
  const moeda = new Map(metas.map((m) => [idDe(m), m.moeda]));
  // "só registro" (dinheiro que já estava guardado) não entra no saldo do mês
  return round2(contribuicoes.filter((c) => !c.registro && mesDe(c.data) === mes && moeda.has(idDe(c.meta)))
    .reduce((s, c) => s + conv(Number(c.valor), moeda.get(idDe(c.meta))), 0));
}

/**
 * Depósitos automáticos que já deviam ter sido feitos: um por mês, no dia escolhido,
 * a partir de `mensal.desde` (nunca antes) até hoje, sem repetir nem refazer os apagados.
 */
export function depositosAutomaticosDevidos(meta, existentes = [], hoje = new Date()) {
  const m = meta.mensal;
  if (!m || !(Number(m.valor) > 0) || !m.desde || meta.arquivada) return [];
  const feitos = new Set(existentes.filter((c) => c.automatica && c.competencia).map((c) => c.competencia));
  const ignoradas = new Set(meta.ignoradas || []);
  // compara por dia: o próprio dia de ligar e o dia de hoje contam
  const desde = diaISO(m.desde), ate = diaISO(hoje);
  const out = [];
  for (const comp of mesesEntre(mesDe(m.desde), mesDe(hoje))) {
    const data = diaNoMes(comp, Number(m.dia) || 1);
    if (diaISO(data) < desde || diaISO(data) > ate || feitos.has(comp) || ignoradas.has(comp)) continue;
    out.push({ meta: idDe(meta), valor: round2(m.valor), data: data.toISOString(), conta: m.conta ? idDe(m.conta) : null, automatica: true, competencia: comp, pessoa: '', nota: '' });
  }
  return out;
}

/**
 * Dinheiro separado para viagens num mês (moeda base): o que foi separado menos o que já foi gasto
 * com ele. Separar tira do saldo do mês; gastar o separado não tira de novo.
 */
export function separadoViagensNoMes(reservas, viagens, gastosReserva, conv, mes) {
  const moeda = new Map(viagens.map((v) => [idDe(v), v.moeda]));
  let s = 0;
  for (const r of reservas) if (mesDe(r.data) === mes && moeda.has(idDe(r.viagem))) s += conv(Number(r.valorViagem ?? r.valor), moeda.get(idDe(r.viagem)));
  for (const l of gastosReserva) {
    if (!l.reservaViagem || mesDe(l.data) !== mes || !moeda.has(idDe(l.viagem))) continue;
    s -= (l.tipo === 'receita' ? -1 : 1) * conv(Number(l.valorConta ?? l.valor), moeda.get(idDe(l.viagem)));
  }
  return round2(s);
}

// ---------- distribuição do salário (Einkommensverteiler) ----------

/**
 * Quanto de um salário vai para a meta/poupança, pela regra:
 * - 'excedente': tudo o que passar de `limite` (ex.: salário 3.100, limite 2.860 → 240);
 * - 'pct': `valor`% do salário; - 'fixo': `valor` fixo.
 * Em 'pct' e 'fixo', `limite` (opcional) é o salário mínimo para a regra valer.
 * `salario` já vem na moeda da meta.
 */
export function valorDaRegraSalario(regra, salario) {
  const s = Number(salario) || 0, lim = Number(regra?.limite) || 0, v = Number(regra?.valor) || 0;
  if (!regra?.ativo || s <= 0) return 0;
  if (regra.modo === 'excedente') return round2(Math.max(0, s - lim));
  if (lim > 0 && s < lim) return 0;
  if (regra.modo === 'pct') return round2((s * Math.min(100, Math.max(0, v))) / 100);
  return round2(Math.min(s, Math.max(0, v)));
}

/**
 * Compara os salários recebidos (desde que a regra foi ligada) com os depósitos já feitos por ela.
 * `salarios`: lançamentos de receita da categoria da regra; `existentes`: contribuições com `salario`.
 * `conv(valor, moeda)` converte para a moeda da meta. Devolve o que criar, atualizar e apagar.
 */
export function sincronizarRegraSalario(meta, salarios, existentes, conv) {
  const regra = meta.regraSalario;
  const ignorados = new Set((meta.ignoradosSalario || []).map(String));
  const porSalario = new Map(existentes.filter((c) => c.salario).map((c) => [idDe(c.salario), c]));
  const criar = [], atualizar = [], apagar = [];
  const validos = new Set();
  if (regra?.ativo && regra.desde) {
    const desde = diaISO(regra.desde);
    for (const l of salarios) {
      const id = idDe(l);
      if (l.tipo !== 'receita' || idDe(l.categoria) !== idDe(regra.categoria) || diaISO(l.data) < desde || ignorados.has(id)) continue;
      const base = round2(conv(Number(l.valor), l.moeda));
      const v = valorDaRegraSalario(regra, base);
      if (v <= 0) continue;
      validos.add(id);
      const ja = porSalario.get(id);
      if (!ja) criar.push({ salario: id, valor: v, base, data: l.data });
      else if (Math.abs(Number(ja.valor) - v) > 0.004 || diaISO(ja.data) !== diaISO(l.data)) atualizar.push({ _id: idDe(ja), valor: v, base, data: l.data });
    }
  }
  for (const [id, c] of porSalario) if (!validos.has(id)) apagar.push(idDe(c));
  return { criar, atualizar, apagar };
}

export function relatorioAnual({ ano, lancamentos, categorias, movsRend = [], contasRend = [], contribuicoes = [], metas = [], reservasViagem = [], viagens = [], conv }) {
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
  const vazio = () => meses.map(() => 0);
  const entradas = vazio(), saidas = vazio(), rendimentos = vazio();
  const gastosReserva = lancamentos.filter((l) => l.reservaViagem);
  const guardado = meses.map((m) => round2(guardadoNoMes(contribuicoes, metas, conv, m) + separadoViagensNoMes(reservasViagem, viagens, gastosReserva, conv, m)));
  const porCat = new Map();
  const catMap = new Map(categorias.map((c) => [idDe(c), c]));
  const dedutiveis = [];
  for (const l of lancamentos) {
    if (l.tipo === 'transferencia' || l.ajuste) continue;
    const m = mesDe(l.data);
    const i = meses.indexOf(m);
    if (i < 0) continue;
    const v = conv(Number(l.valor), l.moeda);
    if (l.tipo === 'receita') entradas[i] += v; else saidas[i] += v;
    const k = `${l.tipo}:${idDe(l.categoria) || 'sem'}`;
    if (!porCat.has(k)) porCat.set(k, { tipo: l.tipo, categoria: idDe(l.categoria), meses: vazio(), total: 0 });
    const c = porCat.get(k); c.meses[i] += v; c.total += v;
    const cat = catMap.get(idDe(l.categoria));
    if (l.tipo === 'despesa' && cat?.dedutivel) dedutiveis.push({ _id: l._id, data: l.data, descricao: l.descricao, categoria: idDe(l.categoria), valor: Number(l.valor), moeda: l.moeda, valorBase: round2(v), nota: l.nota || '' });
  }
  const contaMoeda = new Map(contasRend.map((c) => [idDe(c), c.moeda]));
  for (const mv of movsRend) {
    if (mv.tipo !== 'rendimento') continue;
    const i = meses.indexOf(mesDe(mv.data));
    if (i >= 0) rendimentos[i] += conv(Number(mv.valor), contaMoeda.get(idDe(mv.conta)) || 'EUR');
  }
  const r2 = (a) => a.map(round2);
  const soma = (a) => round2(a.reduce((s, x) => s + x, 0));
  const categoriasOut = [...porCat.values()].map((c) => {
    const cat = catMap.get(c.categoria);
    return { ...c, nome: cat?.nome || null, icone: cat?.icone || '•', cor: cat?.cor || '#8a92a3', dedutivel: !!cat?.dedutivel, meses: r2(c.meses), total: round2(c.total) };
  }).sort((a, b) => b.total - a.total);
  return {
    ano, meses,
    entradas: r2(entradas), saidas: r2(saidas), rendimentos: r2(rendimentos), metas: guardado,
    saldo: meses.map((_, i) => round2(entradas[i] - saidas[i] - guardado[i])),
    totais: { entradas: soma(entradas), saidas: soma(saidas), rendimentos: soma(rendimentos), metas: soma(guardado), saldo: round2(soma(entradas) - soma(saidas) - soma(guardado)), dedutiveis: round2(dedutiveis.reduce((s, d) => s + d.valorBase, 0)) },
    categorias: categoriasOut,
    dedutiveis: dedutiveis.sort((a, b) => t(a.data) - t(b.data)),
  };
}

// ---------- lembretes ----------

/**
 * O que vence ou pede atenção nos próximos `dias` dias: despesas recorrentes, faturas de cartão
 * e categorias que passaram do alerta do orçamento. Cada item tem uma `chave` estável
 * (para não avisar duas vezes a mesma coisa).
 */
export function lembretes({ recorrentes = [], cartoes = [], lancamentos = [], orcamentos = [], hoje = new Date(), dias = 7 }) {
  const agora = t(hoje);
  const limite = agora + dias * 86400000;
  const itens = [];
  const horizonte = new Date(agora + 60 * 86400000);
  for (const r of recorrentes.filter((x) => x.ativo && x.tipo === 'despesa')) {
    const devidas = competenciasDevidas({ ...r, ignoradas: [] }, horizonte);
    for (const m of devidas) {
      const d = diaNoMes(m, r.diaDoMes);
      if (t(d) + 43200000 < agora || t(d) > limite) continue;
      itens.push({ tipo: 'recorrente', chave: `rec:${idDe(r)}:${m}`, titulo: r.descricao, valor: Number(r.valor), moeda: r.moeda, data: d.toISOString(), ref: idDe(r) });
    }
  }
  for (const c of cartoes) {
    for (const f of faturasCartao(c, lancamentos, hoje)) {
      if (f.restante <= 0 || f.estado === 'aberta' || f.estado === 'vazia') continue;
      if (t(f.vencimento) > limite) continue;
      itens.push({ tipo: f.estado === 'vencida' ? 'fatura-vencida' : 'fatura', chave: `fat:${idDe(c)}:${f.mes}`, titulo: c.nome, valor: f.restante, moeda: c.moeda, data: f.vencimento, ref: idDe(c), mes: f.mes });
    }
  }
  const mes = mesDe(hoje);
  for (const o of orcamentos.filter((x) => x.estado === 'alerta' || x.estado === 'estourado')) {
    itens.push({ tipo: o.estado === 'estourado' ? 'orcamento-estourado' : 'orcamento', chave: `orc:${idDe(o.categoria)}:${mes}:${o.estado}`, titulo: o.nome, valor: o.gasto, limite: o.limite, pct: o.pct, data: hoje.toISOString ? hoje.toISOString() : new Date(hoje).toISOString(), ref: idDe(o.categoria) });
  }
  return itens.sort((a, b) => t(a.data) - t(b.data));
}
