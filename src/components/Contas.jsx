import { useCallback, useEffect, useMemo, useState } from 'react';
import { del, get, post, put } from '../api.js';
import { compacto, dataCompleta, dataCurta, dinheiro, hojeISO, lerNumero, mesAtual, mesCurto, mesLongo, paraCampo, paraInput } from '../fmt.js';
import { useT } from '../i18n.js';
import { useDados } from '../dados.jsx';
import { Barra, BotaoConfirmar, Campo, Carregando, Modal, Segmentado, SeletorMes, Vazio, useAviso } from './ui.jsx';
import { FormLancamento, ItemLancamento } from './Lancamentos.jsx';
import Icone from './Icones.jsx';

const GRUPOS = ['corrente', 'rendimento', 'investimento', 'separado', 'cartao', 'divida'];
const ICONE_TIPO = { corrente: 'banco', dinheiro: 'banco', investimento: 'rendimento', rendimento: 'rendimento', divida: 'menos', cartao: 'lista' };
const CORES = ['#2952eb', '#0d8c54', '#e0672b', '#8b5cf6', '#db2777', '#0ea5a4', '#c47a0a', '#475569'];
const ESTADO_FATURA = { aberta: 'bg-marca-suave text-marca', fechada: 'bg-aviso-suave text-aviso', vencida: 'bg-neg-suave text-neg', paga: 'bg-pos-suave text-pos', vazia: 'bg-sutil text-texto-3' };

export default function Contas({ base, categorias, irPara }) {
  const t = useT();
  const avisar = useAviso();
  const { recarregar: recarregarDados } = useDados();
  const [dados, setDados] = useState(null);
  const [form, setForm] = useState(null);
  const [aberta, setAberta] = useState(null);
  const carregar = useCallback(async () => { setDados(await get(`/carteira?base=${base}`)); recarregarDados(); }, [base, recarregarDados]);
  useEffect(() => { carregar().catch((e) => avisar(e.message, 'erro')); }, [carregar, avisar]);

  if (!dados) return <Carregando />;
  const ativas = dados.contas.filter((c) => !c.arquivada);
  const arquivadas = dados.contas.filter((c) => c.arquivada);
  const grupo = (g) => g === 'separado' ? dados.patrimonio.itens.filter((i) => i.tipo === 'separado') : g === 'corrente' ? ativas.filter((c) => c.tipo === 'corrente' || c.tipo === 'dinheiro') : g === 'rendimento' ? dados.rendimento : ativas.filter((c) => c.tipo === g);
  const p = dados.patrimonio;
  const vazio = !dados.contas.length && !dados.rendimento.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl">{t('contas.titulo')}</h2>
        <button className="btn-primario" onClick={() => setForm({})}><Icone nome="mais" className="h-4 w-4" forte />{t('contas.nova')}</button>
      </div>

      {vazio ? (
        <Vazio icone="banco" titulo={t('contas.vazioTitulo')} texto={t('contas.vazio')} acao={<button className="btn-primario" onClick={() => setForm({})}>{t('contas.nova')}</button>} />
      ) : (
        <section className="overflow-hidden rounded-4xl bg-capa p-6 text-capa-texto shadow-flutua">
          <p className="text-sm font-semibold opacity-75">{t('contas.liquido')}</p>
          <p className="num mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">{dinheiro(p.liquido, base)}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs font-semibold opacity-80">{t('contas.tenho')}</p><p className="num mt-0.5 font-bold">{dinheiro(p.ativos, base)}</p></div>
            <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs font-semibold opacity-80">{t('contas.devo')}</p><p className="num mt-0.5 font-bold">{dinheiro(p.passivos, base)}</p></div>
          </div>
          {dados.serie.some((s) => s.liquido !== 0) && <MiniSerie serie={dados.serie} base={base} rotulo={t('contas.evolucao')} />}
        </section>
      )}

      {GRUPOS.map((g) => {
        const lista = grupo(g);
        if (!lista.length) return null;
        return (
          <section key={g}>
            <h3 className="mb-2 px-1 text-base">{t(`contas.grupos.${g}`)}</h3>
            <ul className="cartao divide-y divide-linha overflow-hidden">
              {lista.map((c) => (
                <li key={`${g}-${c._id}`}>
                  {g === 'separado' ? (
                    <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-sutil/60" onClick={() => irPara(c.origem === 'meta' ? 'metas' : 'viagens')}>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-marca-suave text-lg">{c.icone || '•'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{c.nome}</span>
                        <span className="block text-xs text-texto-3">{t(c.origem === 'meta' ? 'abas.metas' : 'abas.viagens')}</span>
                      </span>
                      <span className="text-right"><span className="num block text-sm font-bold">{dinheiro(c.saldo, c.moeda)}</span>
                        {c.moeda !== base && <span className="num block text-xs text-texto-3">≈ {dinheiro(c.saldoBase, base)}</span>}</span>
                    </button>
                  ) : g === 'rendimento'
                    ? <LinhaConta conta={{ ...c, tipo: 'rendimento' }} base={base} detalhe={t('contas.jurosMes', { v: dinheiro(c.jurosMes, c.moeda) })} aoAbrir={() => irPara('rendimento')} />
                    : <LinhaConta conta={c} base={base} aoAbrir={() => setAberta(c._id)} />}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {arquivadas.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-base text-texto-2">{t('contas.arquivadas')}</h3>
          <ul className="cartao divide-y divide-linha overflow-hidden opacity-70">
            {arquivadas.map((c) => <li key={c._id}><LinhaConta conta={c} base={base} aoAbrir={() => setAberta(c._id)} /></li>)}
          </ul>
        </section>
      )}

      <FormConta aberto={form !== null} conta={form} contas={dados.contas} aoFechar={() => setForm(null)}
        aoSalvar={async (novo) => { setForm(null); await carregar(); avisar(t(novo ? 'contas.criada' : 'contas.salva')); }}
        aoApagar={async (id) => {
          try { await del(`/carteira/${id}`); setForm(null); setAberta(null); await carregar(); avisar(t('contas.apagada')); }
          catch (e) { avisar(e.message, 'erro'); }
        }} />
      <DetalheConta conta={dados.contas.find((c) => c._id === aberta) || null} categorias={categorias} aoFechar={() => setAberta(null)}
        aoEditar={(c) => { setAberta(null); setForm(c); }} aoMudar={carregar} />
    </div>
  );
}

function LinhaConta({ conta: c, base, aoAbrir, detalhe }) {
  const t = useT();
  const cartao = c.cartao;
  return (
    <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-sutil/60" onClick={aoAbrir}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: `${c.cor || '#2952eb'}1f`, color: c.cor || '#2952eb' }}>
        <Icone nome={ICONE_TIPO[c.tipo] || 'banco'} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{c.nome}</span>
        {cartao ? (
          <span className="mt-1 block">
            <Barra valor={cartao.usado} maximo={cartao.limite || cartao.usado || 1} estado={cartao.pctUsado >= 90 ? 'estourado' : cartao.pctUsado >= 70 ? 'alerta' : 'ok'} />
            <span className="mt-1 block truncate text-xs text-texto-3">
              {cartao.proximaAPagar ? t('contas.aPagar', { v: dinheiro(cartao.proximaAPagar.restante, c.moeda), d: dataCurta(cartao.proximaAPagar.vencimento) })
                : cartao.faturaAtual ? `${t('contas.faturaAtual')} ${dinheiro(cartao.faturaAtual.total, c.moeda)} · ${t('contas.fecha', { d: dataCurta(cartao.faturaAtual.fechamento) })}`
                : cartao.limite ? `${t('contas.disponivel')} ${dinheiro(cartao.disponivel, c.moeda)}` : t(`contas.tipos.${c.tipo}`)}
            </span>
          </span>
        ) : (
          <span className="block truncate text-xs text-texto-3">{detalhe || [c.instituicao, t(`contas.tipos.${c.tipo}`)].filter(Boolean).join(' · ')}</span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className={`num block text-sm font-bold ${c.saldo < 0 ? 'text-neg' : ''}`}>{dinheiro(c.saldo, c.moeda)}</span>
        {c.moeda !== base && <span className="num block text-xs text-texto-3">≈ {dinheiro(c.saldoBase, base)}</span>}
      </span>
    </button>
  );
}

function MiniSerie({ serie, base, rotulo }) {
  const L = 600, A = 90;
  const vals = serie.map((s) => s.liquido);
  const min = Math.min(...vals), max = Math.max(...vals);
  const amp = max - min || Math.abs(max) || 1;
  const x = (i) => (L * i) / Math.max(serie.length - 1, 1);
  const y = (v) => 8 + (A - 16) * (1 - (v - min) / amp);
  const d = serie.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.liquido).toFixed(1)}`).join(' ');
  return (
    <div className="mt-5">
      <div className="mb-1 flex justify-between text-xs opacity-75"><span>{rotulo}</span><span className="num">{compacto(serie[0].liquido, base)} → {compacto(serie.at(-1).liquido, base)}</span></div>
      <svg viewBox={`0 0 ${L} ${A}`} className="h-20 w-full" preserveAspectRatio="none" role="img" aria-label={rotulo}>
        <path d={`${d} L${L},${A} L0,${A} Z`} fill="white" fillOpacity="0.12" />
        <path d={d} fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] opacity-60"><span>{mesCurto(serie[0].mes)}</span><span>{mesCurto(serie.at(-1).mes)}</span></div>
    </div>
  );
}

function DetalheConta({ conta, categorias, aoFechar, aoEditar, aoMudar }) {
  const t = useT();
  const avisar = useAviso();
  const { mesAtualFin } = useDados();
  const [mes, setMes] = useState(mesAtualFin);
  const [lista, setLista] = useState(null);
  const [faturas, setFaturas] = useState(null);
  const [form, setForm] = useState(null);
  const [ajuste, setAjuste] = useState(false);
  const [pagar, setPagar] = useState(null);
  const [faturaAberta, setFaturaAberta] = useState(null);
  const id = conta?._id;
  const cartao = conta?.tipo === 'cartao';
  const catMap = useMemo(() => new Map(categorias.map((c) => [c._id, c])), [categorias]);

  const carregar = useCallback(async () => {
    if (!id) return;
    if (cartao) setFaturas(await get(`/carteira/${id}/faturas`));
    else setLista(await get(`/lancamentos?mes=${mes}&conta=${id}`));
  }, [id, cartao, mes]);
  useEffect(() => { setLista(null); setFaturas(null); carregar().catch((e) => avisar(e.message, 'erro')); }, [carregar, avisar]);
  useEffect(() => { if (!id) { setMes(mesAtualFin()); setFaturaAberta(null); } }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!conta) return null;
  const depois = async (msg) => { await Promise.all([carregar(), aoMudar()]); if (msg) avisar(msg); };

  return (
    <Modal titulo={conta.nome} aberto={!!conta} aoFechar={aoFechar} largo>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="rotulo">{t(`contas.tipos.${conta.tipo}`)}{conta.instituicao ? ` · ${conta.instituicao}` : ''}</p>
            <p className={`num text-3xl font-extrabold tracking-tight ${conta.saldo < 0 ? 'text-neg' : ''}`}>{dinheiro(conta.saldo, conta.moeda)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {cartao && faturas?.proximaAPagar && (
              <button className="btn-primario px-4 py-2.5" onClick={() => setPagar(faturas.proximaAPagar)}>{t('contas.pagar')}</button>
            )}
            {!cartao && <button className="btn-secundario px-4 py-2.5" onClick={() => setForm({ tipo: 'transferencia', conta: conta._id, moeda: conta.moeda })}><Icone nome="recorrente" className="h-4 w-4" />{t('contas.transferir')}</button>}
            {!cartao && <button className="btn-secundario px-4 py-2.5" onClick={() => setAjuste(true)}>{conta.tipo === 'investimento' ? t('contas.atualizarValor') : t('contas.ajustar')}</button>}
            <button className="btn-secundario px-3 py-2.5" onClick={() => aoEditar(conta)} aria-label={t('comum.editar')}><Icone nome="lapis" className="h-4 w-4" /></button>
          </div>
        </div>

        {cartao ? (
          !faturas ? <Carregando /> : (
            <>
              {faturas.limite > 0 && (
                <div className="rounded-2xl bg-sutil p-4">
                  <div className="mb-2 flex justify-between text-sm"><span className="font-semibold">{t('contas.usado')} {dinheiro(faturas.usado, conta.moeda)}</span><span className="text-texto-2">{t('contas.disponivel')} {dinheiro(faturas.disponivel, conta.moeda)}</span></div>
                  <Barra valor={faturas.usado} maximo={faturas.limite} estado={faturas.pctUsado >= 90 ? 'estourado' : faturas.pctUsado >= 70 ? 'alerta' : 'ok'} />
                  <p className="mt-1.5 text-xs text-texto-3">{t('contas.limiteUsado', { p: Math.round(faturas.pctUsado) })} · {t('contas.limite')} {dinheiro(faturas.limite, conta.moeda)}</p>
                </div>
              )}
              <div>
                <p className="rotulo mb-2">{t('contas.faturas')}</p>
                {!faturas.faturas.length ? <p className="text-sm text-texto-2">{t('contas.semFaturas')}</p> : (
                  <ul className="divide-y divide-linha overflow-hidden rounded-2xl border border-linha">
                    {faturas.faturas.filter((f) => f.estado !== 'vazia').map((f) => (
                      <li key={f.mes}>
                        <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sutil/60" onClick={() => setFaturaAberta(faturaAberta === f.mes ? null : f.mes)} aria-expanded={faturaAberta === f.mes}>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2"><span className="text-sm font-bold">{mesLongo(f.mes)}</span><span className={`chip ${ESTADO_FATURA[f.estado]}`}>{t(`contas.estadoFatura.${f.estado}`)}</span></span>
                            <span className="block text-xs text-texto-3">{t('contas.fecha', { d: dataCurta(f.fechamento) })} · {t('contas.vence', { d: dataCurta(f.vencimento) })} · {t('contas.compras', { n: f.quantidade })}{f.pago > 0 ? ` · ${t('contas.pago', { v: dinheiro(f.pago, conta.moeda) })}` : ''}</span>
                          </span>
                          <span className="num text-sm font-bold">{dinheiro(f.total, conta.moeda)}</span>
                        </button>
                        {faturaAberta === f.mes && (
                          <div className="border-t border-linha bg-sutil/40">
                            <ul className="divide-y divide-linha">
                              {f.itens.map((l) => <li key={l._id}><ItemLancamento l={l} cat={catMap.get(l.categoria)} contaAtual={conta._id} aoAbrir={() => setForm(l)} /></li>)}
                            </ul>
                            {f.restante > 0 && f.estado !== 'aberta' && <div className="p-3 text-right"><button className="btn-primario px-4 py-2" onClick={() => setPagar(f)}>{t('contas.pagar')}</button></div>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-xs text-texto-3">{t('contas.cartaoDica')}</p>
            </>
          )
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between gap-2"><p className="rotulo">{t('contas.movimentos')}</p><SeletorMes mes={mes} aoMudar={setMes} /></div>
            {!lista ? <Carregando /> : !lista.length ? <p className="py-4 text-center text-sm text-texto-2">{t('contas.semMov')}</p> : (
              <ul className="divide-y divide-linha overflow-hidden rounded-2xl border border-linha">
                {lista.map((l) => <li key={l._id}><ItemLancamento l={l} cat={catMap.get(l.categoria)} contaAtual={conta._id} aoAbrir={() => setForm(l)} /></li>)}
              </ul>
            )}
            {conta.tipo === 'divida' && <p className="mt-3 text-xs text-texto-3">{t('contas.dividaDica')}</p>}
          </div>
        )}
      </div>

      <FormLancamento aberto={form !== null} item={form} categorias={categorias} aoFechar={() => setForm(null)}
        aoSalvar={async () => { setForm(null); await depois(t('lanc.salvo')); }}
        aoApagar={async (lid, todas) => { await del(`/lancamentos/${lid}${todas ? '?todas=1' : ''}`); setForm(null); await depois(t('lanc.apagado')); }} />
      <ModalAjuste aberto={ajuste} conta={conta} aoFechar={() => setAjuste(false)} aoSalvar={async (msg) => { setAjuste(false); await depois(msg); }} />
      <ModalPagar fatura={pagar} cartao={conta} aoFechar={() => setPagar(null)} aoSalvar={async () => { setPagar(null); await depois(t('contas.pagamentoOk')); }} />
    </Modal>
  );
}

function ModalAjuste({ aberto, conta, aoFechar, aoSalvar }) {
  const t = useT();
  const avisar = useAviso();
  const [saldo, setSaldo] = useState('');
  const [data, setData] = useState(hojeISO());
  useEffect(() => { if (aberto) { setSaldo(paraCampo(conta.saldo)); setData(hojeISO()); } }, [aberto, conta]);
  const salvar = async (e) => {
    e.preventDefault();
    const v = lerNumero(saldo);
    if (!Number.isFinite(v)) return avisar(t('lanc.informeValor'), 'erro');
    try {
      const r = await post(`/carteira/${conta._id}/ajuste`, { saldo: v, data });
      aoSalvar(r.diferenca ? t('contas.ajustado') : t('contas.semAjuste'));
    } catch (err) { avisar(err.message, 'erro'); }
  };
  return (
    <Modal titulo={t('contas.ajustarTitulo', { n: conta.nome })} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={`${t('contas.novoSaldo')} (${conta.moeda})`}><input id="ajuste-saldo" className="campo num text-xl font-bold" inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} autoFocus /></Campo>
          <Campo rotulo={t('comum.data')}><input id="ajuste-data" type="date" className="campo" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
        </div>
        <p className="text-xs text-texto-3">{t('contas.ajustarDica')}</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
          <button className="btn-primario">{t('comum.salvar')}</button>
        </div>
      </form>
    </Modal>
  );
}

function ModalPagar({ fatura, cartao, aoFechar, aoSalvar }) {
  const t = useT();
  const avisar = useAviso();
  const { contasAtivas } = useDados();
  const origens = contasAtivas.filter((c) => c.tipo !== 'cartao' && c.tipo !== 'divida');
  const [f, setF] = useState({});
  useEffect(() => {
    if (!fatura) return;
    setF({ valor: paraCampo(fatura.restante), origem: cartao.contaPagamento || origens[0]?._id || '', data: hojeISO(), valorOrigem: '' });
  }, [fatura]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!fatura) return null;
  const origem = origens.find((c) => c._id === f.origem);
  const moedasDiferentes = origem && origem.moeda !== cartao.moeda;
  const salvar = async (e) => {
    e.preventDefault();
    const valor = lerNumero(f.valor);
    if (!(valor > 0)) return avisar(t('lanc.informeValor'), 'erro');
    if (!f.origem) return avisar(t('erro.escolha_origem'), 'erro');
    try {
      await post(`/carteira/${cartao._id}/pagar`, { mes: fatura.mes, descricao: t('contas.descPagamento', { n: cartao.nome, m: mesLongo(fatura.mes) }), valor, origem: f.origem, data: f.data, ...(moedasDiferentes ? { valorOrigem: lerNumero(f.valorOrigem) || undefined } : {}) });
      aoSalvar();
    } catch (err) { avisar(err.message, 'erro'); }
  };
  return (
    <Modal titulo={t('contas.pagarTitulo', { m: mesLongo(fatura.mes) })} aberto={!!fatura} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={`${t('contas.valorPagar')} (${cartao.moeda})`}><input id="pagar-valor" className="campo num text-xl font-bold" inputMode="decimal" value={f.valor ?? ''} onChange={(e) => setF((x) => ({ ...x, valor: e.target.value }))} /></Campo>
          <Campo rotulo={t('comum.data')}><input id="pagar-data" type="date" className="campo" value={f.data || ''} onChange={(e) => setF((x) => ({ ...x, data: e.target.value }))} /></Campo>
        </div>
        <Campo rotulo={t('contas.pagarCom')}>
          <select id="pagar-origem" className="campo" value={f.origem} onChange={(e) => setF((x) => ({ ...x, origem: e.target.value }))}>
            <option value="">—</option>{origens.map((c) => <option key={c._id} value={c._id}>{c.nome} · {dinheiro(c.saldo, c.moeda)}</option>)}
          </select>
        </Campo>
        {moedasDiferentes && (
          <Campo rotulo={`${t('comum.valor')} (${origem.moeda})`} dica={t('lanc.valorRecebidoDica')}>
            <input id="pagar-valor-origem" className="campo num" inputMode="decimal" value={f.valorOrigem} onChange={(e) => setF((x) => ({ ...x, valorOrigem: e.target.value }))} />
          </Campo>
        )}
        <p className="text-xs text-texto-3">{t('contas.vence', { d: dataCompleta(fatura.vencimento) })} · {dinheiro(fatura.total, cartao.moeda)}</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
          <button className="btn-primario">{t('contas.pagar')}</button>
        </div>
      </form>
    </Modal>
  );
}

function FormConta({ aberto, conta, contas, aoFechar, aoSalvar, aoApagar }) {
  const t = useT();
  const avisar = useAviso();
  const novo = !conta?._id;
  const [f, setF] = useState({});
  useEffect(() => {
    if (!aberto) return;
    setF(conta?._id
      ? { ...conta, saldoInicial: paraCampo(conta.tipo === 'divida' || conta.tipo === 'cartao' ? -conta.saldoInicial : conta.saldoInicial),
        limite: paraCampo(conta.limite), dataInicio: paraInput(conta.dataInicio), contaPagamento: conta.contaPagamento || '' }
      : { nome: '', tipo: 'corrente', instituicao: '', moeda: 'EUR', saldoInicial: '', dataInicio: hojeISO(), cor: CORES[0], limite: '', diaFechamento: 25, diaVencimento: 5, contaPagamento: '' });
  }, [aberto, conta]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const ehCartao = f.tipo === 'cartao', ehDivida = f.tipo === 'divida';

  const salvar = async (e) => {
    e.preventDefault();
    if (!f.nome?.trim()) return avisar(t('contas.deNome'), 'erro');
    const saldo = f.saldoInicial === '' ? 0 : lerNumero(f.saldoInicial);
    if (!Number.isFinite(saldo)) return avisar(t('lanc.informeValor'), 'erro');
    const corpo = {
      nome: f.nome, tipo: f.tipo, instituicao: f.instituicao, moeda: f.moeda, cor: f.cor, dataInicio: f.dataInicio,
      // dívida e cartão: o valor digitado é o que se deve
      saldoInicial: ehDivida || ehCartao ? -Math.abs(saldo) : saldo,
      ...(ehCartao ? { limite: lerNumero(f.limite) || 0, diaFechamento: Number(f.diaFechamento) || 25, diaVencimento: Number(f.diaVencimento) || 5, contaPagamento: f.contaPagamento || null } : {}),
    };
    try { novo ? await post('/carteira', corpo) : await put(`/carteira/${conta._id}`, corpo); aoSalvar(novo); }
    catch (err) { avisar(err.message, 'erro'); }
  };
  const dias = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <Modal titulo={novo ? t('contas.novaTitulo') : t('contas.editarTitulo')} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {novo && (
          <Campo grupo rotulo={t('contas.tipo')}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {['corrente', 'dinheiro', 'investimento', 'cartao', 'divida'].map((tp) => (
                <button type="button" key={tp} aria-pressed={f.tipo === tp} onClick={() => setF((x) => ({ ...x, tipo: tp }))}
                  className={`flex items-center gap-2 rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${f.tipo === tp ? 'bg-marca-suave text-marca ring-2 ring-marca' : 'bg-sutil text-texto-2 hover:bg-linha'}`}>
                  <Icone nome={ICONE_TIPO[tp]} className="h-4 w-4 shrink-0" />{t(`contas.tipos.${tp}`)}
                </button>
              ))}
            </div>
          </Campo>
        )}
        <Campo rotulo={t('contas.nome')}><input id="conta-nome2" className="campo" value={f.nome || ''} onChange={set('nome')} placeholder={t('contas.exNome')} /></Campo>
        <Campo rotulo={t('contas.instituicao')}><input id="conta-inst2" className="campo" value={f.instituicao || ''} onChange={set('instituicao')} /></Campo>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Campo rotulo={ehDivida ? t('contas.valorDevido') : ehCartao ? t('contas.faturaAberta') : t('contas.saldoInicial')}>
            <input id="conta-saldo2" className="campo num" inputMode="decimal" value={f.saldoInicial ?? ''} onChange={set('saldoInicial')} placeholder={t('comum.zero')} />
          </Campo>
          <Campo rotulo={t('comum.moeda')}><select id="conta-moeda2" className="campo" value={f.moeda} onChange={set('moeda')}><option>EUR</option><option>BRL</option><option>USD</option></select></Campo>
        </div>
        <Campo rotulo={t('contas.saldoEm')} dica={t('contas.saldoEmDica')}><input id="conta-data2" type="date" className="campo" value={f.dataInicio || ''} onChange={set('dataInicio')} /></Campo>
        {ehCartao && (
          <>
            <Campo rotulo={t('contas.limite')}><input id="conta-limite" className="campo num" inputMode="decimal" value={f.limite ?? ''} onChange={set('limite')} placeholder="2.000" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo={t('contas.fechamento')}><select id="conta-fech" className="campo" value={f.diaFechamento} onChange={set('diaFechamento')}>{dias.map((d) => <option key={d}>{d}</option>)}</select></Campo>
              <Campo rotulo={t('contas.vencimento')}><select id="conta-venc" className="campo" value={f.diaVencimento} onChange={set('diaVencimento')}>{dias.map((d) => <option key={d}>{d}</option>)}</select></Campo>
            </div>
            <Campo rotulo={t('contas.pagarCom')}>
              <select id="conta-pagcom" className="campo" value={f.contaPagamento} onChange={set('contaPagamento')}>
                <option value="">{t('contas.nenhuma')}</option>
                {contas.filter((c) => !c.arquivada && (c.tipo === 'corrente' || c.tipo === 'dinheiro')).map((c) => <option key={c._id} value={c._id}>{c.nome}</option>)}
              </select>
            </Campo>
          </>
        )}
        <Campo grupo rotulo={t('contas.cor')}>
          <div className="flex flex-wrap gap-2">
            {CORES.map((c) => (
              <button type="button" key={c} onClick={() => setF((x) => ({ ...x, cor: c }))} aria-label={c} aria-pressed={f.cor === c}
                className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-cartao ${f.cor === c ? 'ring-2 ring-texto' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </Campo>
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {!novo ? (
            <div className="flex flex-wrap gap-1">
              <button type="button" className="btn-secundario px-4" onClick={async () => { await put(`/carteira/${conta._id}`, { arquivada: !conta.arquivada }); aoSalvar(false); }}>
                {conta.arquivada ? t('contas.reativar') : t('contas.arquivar')}
              </button>
              <BotaoConfirmar texto={t('contas.apagarConf')} aoConfirmar={() => aoApagar(conta._id)}>{t('contas.apagar')}</BotaoConfirmar>
            </div>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
            <button className="btn-primario">{t('comum.salvar')}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

