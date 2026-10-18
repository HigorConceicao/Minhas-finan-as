// Cálculos financeiros puros (sem banco de dados) — fáceis de testar.

export const SAIDAS = ['resgate', 'imposto', 'taxa'];
export const ENTRADAS = ['rendimento', 'aporte'];

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** 'YYYY-MM' de uma data */
export const mesDe = (d) => {
  const x = new Date(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Próximo 'YYYY-MM' */
export const proximoMes = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};

/** Lista de meses de a até b (inclusive), ambos 'YYYY-MM' */
export const mesesEntre = (a, b) => {
  const out = [];
  for (let m = a; m <= b; m = proximoMes(m)) {
    out.push(m);
    if (out.length > 1200) break;
  }
  return out;
};

/** Último dia do mês 'YYYY-MM' (UTC, meio-dia para evitar fuso) */
export const ultimoDiaDoMes = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0, 12));
};

/** Data do mês 'YYYY-MM' no dia indicado, limitado ao último dia do mês */
export const diaNoMes = (m, dia) => {
  const [y, mo] = m.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return new Date(Date.UTC(y, mo - 1, Math.min(dia, ultimo), 12));
};

/** Taxa mensal (decimal) a partir da configuração da conta */
export function taxaMensal(conta) {
  const t = Number(conta.taxa || 0) / 100;
  if (conta.modo === 'anual') return Math.pow(1 + t, 1 / 12) - 1;
  if (conta.modo === 'mensal') return t;
  return null; // manual: sem taxa configurada
}

/** Efeito de um movimento no saldo */
export const efeito = (mov) => (SAIDAS.includes(mov.tipo) ? -1 : 1) * Number(mov.valor);

/** Saldo da conta até (e incluindo) uma data */
export function saldoAte(conta, movimentos, data = new Date()) {
  const limite = new Date(data).getTime();
  return round2(
    movimentos
      .filter((m) => new Date(m.data).getTime() <= limite)
      .reduce((s, m) => s + efeito(m), Number(conta.saldoInicial || 0))
  );
}

/**
 * Série mensal: para cada mês desde a data inicial da conta até o mês de referência,
 * saldo de abertura, juros, aportes, saídas (por tipo) e saldo de fechamento.
 */
export function serieMensal(conta, movimentos, ateMes = mesDe(new Date())) {
  const inicio = mesDe(conta.dataInicio || new Date());
  const meses = mesesEntre(inicio, ateMes);
  const porMes = new Map(meses.map((m) => [m, []]));
  for (const mov of movimentos) {
    const m = mesDe(mov.data);
    if (porMes.has(m)) porMes.get(m).push(mov);
  }
  let saldo = Number(conta.saldoInicial || 0);
  return meses.map((mes) => {
    const movs = porMes.get(mes);
    const soma = (tipo) => round2(movs.filter((x) => x.tipo === tipo).reduce((s, x) => s + Number(x.valor), 0));
    const abertura = round2(saldo);
    const juros = soma('rendimento');
    const aportes = soma('aporte');
    const resgates = soma('resgate');
    const impostos = soma('imposto');
    const taxas = soma('taxa');
    const saidas = round2(resgates + impostos + taxas);
    saldo = abertura + juros + aportes - saidas;
    return {
      mes,
      abertura,
      juros,
      aportes,
      resgates,
      impostos,
      taxas,
      saidas,
      liquido: round2(juros - saidas),
      fechamento: round2(saldo),
      // rentabilidade do mês sobre o saldo de abertura (%)
      rentabilidade: abertura > 0 ? round2((juros / abertura) * 100 * 100) / 100 : 0,
    };
  });
}

/**
 * Quantos meses o saldo dura com saída mensal fixa e taxa mensal r.
 * Retorna Infinity se o rendimento cobre a saída.
 */
export function mesesDeDuracao(saldo, saidaMensal, r) {
  if (saidaMensal <= 0) return Infinity;
  if (saldo * r >= saidaMensal) return Infinity;
  let s = saldo;
  let n = 0;
  while (s > 0 && n < 1200) {
    s = s * (1 + r) - saidaMensal;
    n++;
  }
  return n;
}

/** Projeção mês a mês com taxa r e saída mensal fixa */
export function projecao(saldo, r, saidaMensal, meses, aPartirDe) {
  const out = [];
  let s = saldo;
  let m = aPartirDe;
  let jurosAcum = 0;
  for (let i = 0; i < meses; i++) {
    m = proximoMes(m);
    const juros = Math.max(0, s) * r;
    jurosAcum += juros;
    s = s + juros - saidaMensal;
    out.push({ mes: m, juros: round2(juros), saida: round2(saidaMensal), saldo: round2(s), jurosAcumulados: round2(jurosAcum) });
  }
  return out;
}

/** Todas as métricas de uma conta de rendimento */
export function metricasConta(conta, movimentos, hoje = new Date()) {
  const mesAtual = mesDe(hoje);
  const serie = serieMensal(conta, movimentos, mesAtual);
  const saldoAtual = saldoAte(conta, movimentos, new Date(8640000000000000));

  const tot = (tipo) => round2(movimentos.filter((m) => m.tipo === tipo).reduce((s, m) => s + Number(m.valor), 0));
  const totais = {
    juros: tot('rendimento'),
    aportes: tot('aporte'),
    resgates: tot('resgate'),
    impostos: tot('imposto'),
    taxas: tot('taxa'),
  };
  totais.saidas = round2(totais.resgates + totais.impostos + totais.taxas);
  totais.liquido = round2(totais.juros - totais.saidas);

  const atual = serie[serie.length - 1] || { juros: 0, saidas: 0, liquido: 0 };

  // últimos 12 meses (inclui o atual)
  const ult12 = serie.slice(-12);
  const juros12m = round2(ult12.reduce((s, m) => s + m.juros, 0));

  // meses fechados com juros (exclui o mês atual, que ainda pode não ter rendido)
  const fechados = serie.filter((m) => m.mes < mesAtual);
  const comJuros = fechados.filter((m) => m.juros > 0 && m.abertura > 0);
  const rentMediaReal = comJuros.length
    ? comJuros.slice(-12).reduce((s, m) => s + m.juros / m.abertura, 0) / comJuros.slice(-12).length
    : null;

  const rConfig = taxaMensal(conta);
  const rUsada = rConfig ?? rentMediaReal ?? 0;

  // média de saídas dos últimos 3 meses fechados (ou o atual, se ainda não houver)
  const base = fechados.slice(-3).length ? fechados.slice(-3) : serie.slice(-1);
  const mediaSaidas = base.length ? round2(base.reduce((s, m) => s + m.saidas, 0) / base.length) : 0;

  const jurosProxMes = round2(Math.max(0, saldoAtual) * rUsada);
  const saidaSustentavel = jurosProxMes; // retirada máx. sem reduzir o principal
  const duracao = mesesDeDuracao(saldoAtual, mediaSaidas, rUsada);

  return {
    mesAtual,
    saldoAtual,
    saldoInicial: round2(conta.saldoInicial || 0),
    variacao: round2(saldoAtual - Number(conta.saldoInicial || 0)),
    taxaMensalConfigurada: rConfig === null ? null : round2(rConfig * 100 * 10000) / 10000,
    rentabilidadeMediaReal: rentMediaReal === null ? null : round2(rentMediaReal * 100 * 10000) / 10000,
    taxaMensalUsada: round2(rUsada * 100 * 10000) / 10000,
    taxaAnualEquivalente: round2((Math.pow(1 + rUsada, 12) - 1) * 100 * 100) / 100,
    mes: { juros: atual.juros, saidas: atual.saidas, liquido: atual.liquido, rendimentoLancado: atual.juros > 0 },
    juros12m,
    totais,
    mediaSaidasMensal: mediaSaidas,
    jurosEstimadoProximoMes: jurosProxMes,
    saidaSustentavelMensal: saidaSustentavel,
    duracaoMeses: Number.isFinite(duracao) ? duracao : null, // null = o rendimento cobre as saídas
    rendimentoCobreSaidas: !Number.isFinite(duracao),
    serie,
    projecao12m: projecao(saldoAtual, rUsada, mediaSaidas, 12, mesAtual),
  };
}

/** Meses em que uma recorrência deve gerar lançamento, até hoje (inclusive) */
export function competenciasDevidas(rec, hoje = new Date()) {
  const ini = mesDe(rec.inicio);
  const fim = rec.fim ? mesDe(rec.fim) : mesDe(hoje);
  const ate = fim < mesDe(hoje) ? fim : mesDe(hoje);
  const intervalo = rec.frequencia === 'anual' ? 12 : rec.frequencia === 'trimestral' ? 3 : 1;
  const dia = (d) => new Date(d).toISOString().slice(0, 10);
  const hojeStr = dia(hoje);
  const inicioStr = dia(rec.inicio);
  const fimStr = rec.fim ? dia(rec.fim) : null;
  return mesesEntre(ini, ate)
    .filter((_, i) => i % intervalo === 0)
    .filter((m) => {
      const d = dia(diaNoMes(m, rec.diaDoMes));
      return d >= inicioStr && d <= hojeStr && (!fimStr || d <= fimStr);
    });
}
