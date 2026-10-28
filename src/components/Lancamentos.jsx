import { useCallback, useEffect, useMemo, useState } from 'react';
import { del, get, post, put } from '../api.js';
import { data, dinheiro, hojeISO, lerNumero, paraCampo, paraInput } from '../fmt.js';
import { useT } from '../i18n.js';
import { BotaoConfirmar, Campo, Carregando, IconeCategoria, Modal, Segmentado, SeletorMes, Vazio, useAviso } from './ui.jsx';
import Icone from './Icones.jsx';
import Importar from './Importar.jsx';
import { ultimaConta, useDados } from '../dados.jsx';

export default function Lancamentos({ mes, setMes, categorias, novoSinal, aoConsumirNovo }) {
  const t = useT();
  const avisar = useAviso();
  const [lista, setLista] = useState(null);
  const [form, setForm] = useState(null);
  const [filtroCat, setFiltroCat] = useState('');
  const [busca, setBusca] = useState('');
  const [importando, setImportando] = useState(false);
  const { recarregar: recarregarDados } = useDados();

  const carregar = useCallback(async () => setLista(await get(`/lancamentos?mes=${mes}`)), [mes]);
  useEffect(() => { setLista(null); carregar().catch((e) => avisar(e.message, 'erro')); }, [carregar, avisar]);
  useEffect(() => { if (novoSinal) { setForm({}); aoConsumirNovo?.(); } }, [novoSinal, aoConsumirNovo]);

  const catMap = useMemo(() => new Map(categorias.map((c) => [c._id, c])), [categorias]);
  const filtrada = useMemo(() => (lista || []).filter((l) =>
    (!filtroCat || (filtroCat === 'sem' ? !l.categoria : l.categoria === filtroCat)) &&
    (!busca || l.descricao.toLowerCase().includes(busca.toLowerCase()))), [lista, filtroCat, busca]);

  const grupos = useMemo(() => {
    const g = new Map();
    for (const l of filtrada) {
      const k = l.data.slice(0, 10);
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(l);
    }
    return [...g.entries()];
  }, [filtrada]);

  const totais = useMemo(() => {
    const r = {};
    for (const l of filtrada) {
      if (l.tipo === 'transferencia' || l.ajuste) continue;
      r[l.moeda] ??= { r: 0, d: 0 };
      r[l.moeda][l.tipo === 'receita' ? 'r' : 'd'] += l.valor;
    }
    return r;
  }, [filtrada]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorMes mes={mes} aoMudar={setMes} />
        <div className="flex gap-2">
          <button className="btn-secundario" onClick={() => setImportando(true)}><Icone nome="download" className="h-4 w-4" forte />{t('imp.botao')}</button>
          <button className="btn-primario" onClick={() => setForm({})}><Icone nome="mais" className="h-4 w-4" forte />{t('lanc.novo').replace('+ ', '')}</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Icone nome="busca" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3" />
          <input id="busca-lanc" className="campo pl-10" placeholder={t('lanc.buscar')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select id="filtro-cat" className="campo w-auto" value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}>
          <option value="">{t('lanc.todasCategorias')}</option>
          {categorias.map((c) => <option key={c._id} value={c._id}>{c.icone} {c.nome}</option>)}
          <option value="sem">{t('comum.semCategoria')}</option>
        </select>
      </div>

      {Object.keys(totais).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(totais).map(([moeda, x]) => (
            <span key={moeda} className="num flex gap-3 rounded-full bg-cartao px-4 py-2 text-sm font-semibold shadow-cartao">
              {x.r > 0 && <span className="text-pos">+{dinheiro(x.r, moeda)}</span>}{x.d > 0 && <span className="text-neg">−{dinheiro(x.d, moeda)}</span>}
            </span>
          ))}
        </div>
      )}

      {!lista ? <Carregando /> : !filtrada.length ? (
        <Vazio titulo={t('lanc.nenhum')} texto={lista.length ? t('lanc.nadaFiltro') : t('lanc.vazio')}
          acao={!lista.length && <button className="btn-primario" onClick={() => setForm({})}>{t('comum.adicionar')}</button>} />
      ) : (
        <div className="space-y-4">
          {grupos.map(([dia, itens]) => (
            <section key={dia}>
              <p className="rotulo mb-2 px-1">{data(dia)}</p>
              <ul className="cartao divide-y divide-linha overflow-hidden">
                {itens.map((l) => <li key={l._id}><ItemLancamento l={l} cat={catMap.get(l.categoria)} aoAbrir={() => setForm(l)} /></li>)}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Importar aberto={importando} aoFechar={() => setImportando(false)} categorias={categorias}
        aoImportar={async (m) => { if (m && m !== mes) setMes(m); else await carregar(); }} />
      <FormLancamento aberto={form !== null} item={form} categorias={categorias} aoFechar={() => setForm(null)}
        aoSalvar={async () => { setForm(null); await carregar(); recarregarDados(); avisar(t('lanc.salvo')); }}
        aoApagar={async (id, todas) => { await del(`/lancamentos/${id}${todas ? '?todas=1' : ''}`); setForm(null); await carregar(); avisar(t('lanc.apagado')); }} />
    </div>
  );
}

/** Uma linha de lançamento (lista, extrato de conta, viagem) */
export function ItemLancamento({ l, cat, aoAbrir, contaAtual }) {
  const t = useT();
  const { contas, metas } = useDados();
  const nomeConta = (id) => contas.find((c) => c._id === id)?.nome;
  const transf = l.tipo === 'transferencia';
  // numa conta específica, a transferência é entrada ou saída
  const entrada = transf ? contaAtual && l.contaDestino === contaAtual : l.tipo === 'receita';
  const naContaDaCompra = !transf && contaAtual && contaAtual === l.conta && l.valorConta != null;
  const valor = naContaDaCompra ? l.valorConta : transf && contaAtual === l.contaDestino ? l.valorDestino ?? l.valor : l.valor;
  const moeda = naContaDaCompra ? contas.find((c) => c._id === l.conta)?.moeda || l.moeda
    : transf && contaAtual === l.contaDestino && l.valorDestino != null ? contas.find((c) => c._id === l.contaDestino)?.moeda || l.moeda : l.moeda;
  const detalhes = [];
  if (l.separado) detalhes.push(t(`lanc.sep.${l.separado}${l.contaDestino ? 'Volta' : ''}`));
  else if (transf) detalhes.push(`${nomeConta(l.conta) || '?'} → ${nomeConta(l.contaDestino) || '?'}`);
  else {
    detalhes.push(cat?.nome || t('comum.semCategoria'));
    if (l.meta) detalhes.push(t('lanc.daMeta', { n: metas.find((m) => m._id === l.meta)?.nome || '…' }));
    if (l.reservaViagem) detalhes.push(t('lanc.daReserva'));
    else if (l.conta && !contaAtual && nomeConta(l.conta)) detalhes.push(nomeConta(l.conta));
  }
  if (l.parcela) detalhes.push(t('lanc.parcela', { n: l.parcela.numero, t: l.parcela.total }));
  if (l.ajuste) detalhes.push(t('lanc.ajusteSaldo'));
  if (naContaDaCompra) detalhes.push(dinheiro(l.valor, l.moeda));
  // o que foi separado para metas e viagens aparece no extrato, mas é editado na meta ou na viagem
  const Tag = l.separado ? 'div' : 'button';
  return (
    <Tag className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${l.separado ? '' : 'hover:bg-sutil/60'}`} onClick={l.separado ? undefined : aoAbrir}>
      {l.separado
        ? <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-marca-suave text-marca"><Icone nome={l.separado === 'meta' ? 'meta' : 'aviao'} className="h-4 w-4" /></span>
        : transf
        ? <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sutil text-texto-2"><Icone nome="recorrente" className="h-4 w-4" /></span>
        : <IconeCategoria cor={cat?.cor} icone={cat?.icone} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{l.descricao}</span>
        <span className="flex items-center gap-1 truncate text-xs text-texto-3">
          {detalhes.join(' · ')}
          {l.recorrente && <><span aria-hidden>·</span><Icone nome="recorrente" className="h-3 w-3 shrink-0" />{t('lanc.recorrente')}</>}
          {l.origem === 'applepay' && <span className={`chip ml-1 shrink-0 px-1.5 py-0 text-[10px] ${l.revisar ? 'bg-aviso-suave text-aviso' : 'bg-sutil text-texto-2'}`}>{l.revisar ? t('ap.chipConferir') : 'Apple Pay'}</span>}
        </span>
      </span>
      <span className={`num shrink-0 text-sm font-bold ${transf && !contaAtual ? 'text-texto-2' : entrada ? 'text-pos' : ''}`}>
        {transf && !contaAtual ? '' : entrada ? '+' : '−'}{dinheiro(valor, moeda)}
      </span>
    </Tag>
  );
}

const MOEDAS = ['EUR', 'BRL', 'USD'];
const RESERVA = '__reserva'; // "conta" = dinheiro separado da viagem

/**
 * Formulário de lançamento. `item` sem _id traz valores iniciais (ex.: { tipo: 'transferencia', conta }).
 */
export function FormLancamento({ aberto, item, categorias, aoFechar, aoSalvar, aoApagar }) {
  const t = useT();
  const avisar = useAviso();
  const { contasAtivas, contas, viagensAtivas, viagens, metas, recarregar } = useDados();
  const novo = !item?._id;
  const [f, setF] = useState({});
  const [saldoMes, setSaldoMes] = useState(null); // saldo do mês na moeda do lançamento
  useEffect(() => { if (aberto) recarregar(); }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!aberto) return;
    const ultimaMoeda = (() => { try { return localStorage.getItem('mf2-moeda'); } catch { return null; } })();
    if (item?._id) {
      setF({ ...item, valor: paraCampo(item.valor), valorDestino: paraCampo(item.valorDestino), valorConta: paraCampo(item.valorConta), data: paraInput(item.data), categoria: item.categoria || '',
        conta: item.reservaViagem ? RESERVA : item.conta || '', contaDestino: item.contaDestino || '', viagem: item.viagem || '', meta: item.meta || '', parcelas: '1' });
      return;
    }
    const conta = item?.conta ?? (contasAtivas.some((c) => c._id === ultimaConta.get()) ? ultimaConta.get() : '');
    const moedaConta = contas.find((c) => c._id === conta)?.moeda;
    setF({ tipo: 'despesa', descricao: '', valor: '', moeda: moedaConta || ultimaMoeda || 'EUR', data: hojeISO(), categoria: '', nota: '',
      conta, contaDestino: '', valorDestino: '', valorConta: '', viagem: '', meta: '', parcelas: '1', ...item });
  }, [aberto, item]); // eslint-disable-line react-hooks/exhaustive-deps
  // valor, moeda ou conta mudou: o valor cobrado na conta é recalculado
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, ...(k === 'valor' || k === 'moeda' ? { valorConta: '' } : {}) }));
  const transf = f.tipo === 'transferencia';
  const cats = categorias.filter((c) => c.tipo === f.tipo);
  const contaOrig = contas.find((c) => c._id === f.conta);
  const viagemSel = viagens.find((v) => v._id === f.viagem);
  const reservaDisponivel = !transf && viagemSel?.temReserva;
  const usaReserva = f.conta === RESERVA && reservaDisponivel;
  const contaDest = contas.find((c) => c._id === f.contaDestino);
  const moedasDiferentes = transf && contaOrig && contaDest && contaOrig.moeda !== contaDest.moeda;
  const ehCartao = contaOrig?.tipo === 'cartao' && f.tipo === 'despesa';
  // ao escolher a conta, a moeda acompanha
  const escolherConta = (id) => setF((x) => ({ ...x, conta: id, valorConta: '', moeda: (id === RESERVA ? viagens.find((v) => v._id === x.viagem)?.moeda : contas.find((c) => c._id === id)?.moeda) || x.moeda }));
  const outraMoeda = !transf && contaOrig && f.moeda && contaOrig.moeda !== f.moeda;
  const opcoesConta = (excluir) => [...contasAtivas, ...(f.conta && !contasAtivas.some((c) => c._id === f.conta) ? contas.filter((c) => c._id === f.conta) : [])]
    .filter((c) => c._id !== excluir);
  // pagar com o saldo do mês ou com dinheiro guardado (poupança ou meta)
  const { mesDaData } = useDados();
  const mesDoGasto = f.data ? mesDaData(`${String(f.data).slice(0, 10)}T12:00:00Z`) : '';
  useEffect(() => {
    if (!aberto || f.tipo !== 'despesa' || !/^\d{4}-\d{2}$/.test(mesDoGasto) || !f.moeda) return;
    let vivo = true;
    get(`/resumo?mes=${mesDoGasto}&base=${f.moeda}`).then((r) => { if (vivo) setSaldoMes(r.saldo); }).catch(() => {});
    return () => { vivo = false; };
  }, [aberto, f.tipo, mesDoGasto, f.moeda]);
  const parcelado = ehCartao && Number(f.parcelas) > 1;
  const podePagarComGuardado = f.tipo === 'despesa' && !parcelado;
  const opcoesMeta = metas.filter((m) => (!m.arquivada && m.guardado > 0) || m._id === f.meta);
  const metaSel = metas.find((m) => m._id === f.meta);
  const poupanca = metas.find((m) => m.tipo === 'poupanca' && !m.arquivada);
  const valorNum = lerNumero(f.valor) || 0;
  // ao editar um gasto do mesmo mês que já saía do saldo, ele não conta contra si mesmo
  const jaNoSaldo = !novo && item?.tipo === 'despesa' && !item.meta && mesDaData(item.data) === mesDoGasto && item.moeda === f.moeda ? Number(item.valor) : 0;
  const disponivel = saldoMes == null ? null : saldoMes + jaNoSaldo;
  const faltaSaldo = podePagarComGuardado && !f.meta && disponivel != null && valorNum > 0 && valorNum > disponivel + 0.004;
  const sobraNaMeta = metaSel && metaSel.moeda === f.moeda ? metaSel.guardado + (item?.meta === metaSel._id ? Number(item.valor) : 0) - valorNum : null;
  const opcoesViagem = [...viagensAtivas, ...(f.viagem && !viagensAtivas.some((v) => v._id === f.viagem) ? viagens.filter((v) => v._id === f.viagem) : [])];

  const salvar = async (e) => {
    e.preventDefault();
    const valor = lerNumero(f.valor);
    if (!(valor > 0)) return avisar(t('lanc.informeValor'), 'erro');
    const descricao = f.descricao?.trim() || (transf && contaOrig && contaDest ? `${contaOrig.nome} → ${contaDest.nome}` : '');
    if (!descricao) return avisar(t('lanc.descreva'), 'erro');
    if (transf && (!f.conta || !f.contaDestino || f.conta === f.contaDestino)) return avisar(t('erro.transferencia_contas'), 'erro');
    const corpo = {
      tipo: f.tipo, descricao, valor, moeda: transf ? contaOrig?.moeda || f.moeda : f.moeda, data: f.data, nota: f.nota,
      categoria: transf ? null : f.categoria || null, conta: f.conta === RESERVA ? null : f.conta || null, reservaViagem: !transf && usaReserva, contaDestino: transf ? f.contaDestino : null,
      valorDestino: moedasDiferentes ? lerNumero(f.valorDestino) || null : null, valorConta: outraMoeda ? lerNumero(f.valorConta) || null : null, viagem: transf ? null : f.viagem || null,
      ...(novo && ehCartao && Number(f.parcelas) > 1 ? { parcelas: Number(f.parcelas) } : {}),
      meta: podePagarComGuardado ? f.meta || null : null,
    };
    try {
      novo ? await post('/lancamentos', corpo) : await put(`/lancamentos/${item._id}`, corpo);
      try { localStorage.setItem('mf2-moeda', corpo.moeda); } catch {}
      if (f.conta && f.conta !== RESERVA && !transf) ultimaConta.set(f.conta);
      aoSalvar();
    } catch (err) { avisar(err.message, 'erro'); }
  };

  const tipos = [['despesa', t('comum.despesa')], ['receita', t('comum.receita')]];
  if (contasAtivas.length >= 2 || transf) tipos.push(['transferencia', t('lanc.transferencia')]);

  return (
    <Modal titulo={novo ? t('lanc.novoTitulo') : t('lanc.editarTitulo')} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Segmentado opcoes={tipos} valor={f.tipo} aoMudar={(k) => setF((x) => ({ ...x, tipo: k, categoria: '' }))} />
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Campo rotulo={t('comum.valor')}>
            <input id="lanc-valor" className="campo num text-2xl font-bold" inputMode="decimal" value={f.valor ?? ''} onChange={set('valor')} placeholder={t('comum.zero')} autoFocus={novo} />
          </Campo>
          {transf
            ? <Campo rotulo={t('comum.moeda')}><span className="campo block bg-sutil text-texto-2">{contaOrig?.moeda || '—'}</span></Campo>
            : <Campo rotulo={t('comum.moeda')}><select id="lanc-moeda" className="campo" value={f.moeda} onChange={set('moeda')}>{MOEDAS.map((m) => <option key={m}>{m}</option>)}</select></Campo>}
        </div>

        {podePagarComGuardado && (opcoesMeta.length > 0 || faltaSaldo) && (
          <div className={`space-y-3 rounded-2xl p-4 ${faltaSaldo ? 'bg-aviso-suave' : 'bg-sutil'}`}>
            {opcoesMeta.length > 0 && (
              <Campo rotulo={t('lanc.pagarCom')}>
                <select id="lanc-pagar" className="campo bg-cartao" value={f.meta || ''} onChange={(e) => setF((x) => ({ ...x, meta: e.target.value }))}>
                  <option value="">{disponivel != null ? t('lanc.saldoDoMes', { v: dinheiro(disponivel, f.moeda) }) : t('lanc.saldoDoMesCurto')}</option>
                  {opcoesMeta.map((m) => <option key={m._id} value={m._id}>{m.icone} {m.nome} · {dinheiro(m.guardado, m.moeda)}</option>)}
                </select>
              </Campo>
            )}
            {faltaSaldo && (
              <div className="text-sm">
                <p className="font-semibold text-aviso">{t('lanc.semSaldo', { v: dinheiro(Math.max(0, disponivel), f.moeda) })}</p>
                {poupanca?.guardado > 0 && (
                  <button type="button" className="btn-secundario mt-2 w-full bg-cartao" onClick={() => setF((x) => ({ ...x, meta: poupanca._id }))}>
                    {poupanca.icone} {t('lanc.usarPoupanca', { n: poupanca.nome, v: dinheiro(poupanca.guardado, poupanca.moeda) })}
                  </button>
                )}
              </div>
            )}
            {metaSel && sobraNaMeta != null && (
              <p className={`flex justify-between gap-2 text-sm ${sobraNaMeta < 0 ? 'font-semibold text-neg' : 'text-texto-2'}`}>
                <span>{t('lanc.ficaEm', { n: metaSel.nome })}</span><span className="num font-bold">{dinheiro(sobraNaMeta, metaSel.moeda)}</span>
              </p>
            )}
            {metaSel && <p className="text-xs text-texto-3">{t('lanc.pagarComDica')}</p>}
          </div>
        )}

        {transf ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo={t('lanc.de')}>
                <select id="lanc-conta" className="campo" value={f.conta} onChange={(e) => escolherConta(e.target.value)}>
                  <option value="">—</option>{opcoesConta(null).map((c) => <option key={c._id} value={c._id}>{c.nome}</option>)}
                </select>
              </Campo>
              <Campo rotulo={t('lanc.para')}>
                <select id="lanc-destino" className="campo" value={f.contaDestino} onChange={set('contaDestino')}>
                  <option value="">—</option>{opcoesConta(f.conta).map((c) => <option key={c._id} value={c._id}>{c.nome}</option>)}
                </select>
              </Campo>
            </div>
            {moedasDiferentes && (
              <Campo rotulo={t('lanc.valorRecebido', { m: contaDest.moeda })} dica={t('lanc.valorRecebidoDica')}>
                <input id="lanc-valor-destino" className="campo num" inputMode="decimal" value={f.valorDestino ?? ''} onChange={set('valorDestino')} placeholder={t('comum.zero')} />
              </Campo>
            )}
            <Campo rotulo={t('comum.descricao')}><input id="lanc-desc" className="campo" value={f.descricao || ''} onChange={set('descricao')}
              placeholder={contaOrig && contaDest ? `${contaOrig.nome} → ${contaDest.nome}` : ''} /></Campo>
            <Campo rotulo={t('comum.data')}><input id="lanc-data" type="date" className="campo" value={f.data || ''} onChange={set('data')} /></Campo>
          </>
        ) : (
          <>
            <Campo rotulo={t('comum.descricao')}><input id="lanc-desc" className="campo" value={f.descricao || ''} onChange={set('descricao')} /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo={t('comum.data')}><input id="lanc-data" type="date" className="campo" value={f.data || ''} onChange={set('data')} /></Campo>
              <Campo rotulo={t('comum.categoria')}>
                <select id="lanc-cat" className="campo" value={f.categoria} onChange={set('categoria')}>
                  <option value="">{t('comum.semCategoria')}</option>
                  {cats.map((c) => <option key={c._id} value={c._id}>{c.icone} {c.nome}</option>)}
                </select>
              </Campo>
            </div>
            {(contas.length > 0 || opcoesViagem.length > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {contas.length > 0 && (
                  <Campo rotulo={t('lanc.conta')} className={opcoesViagem.length ? '' : 'col-span-2'}>
                    <select id="lanc-conta" className="campo" value={f.conta} onChange={(e) => escolherConta(e.target.value)}>
                      <option value="">{t('lanc.semConta')}</option>
                      {reservaDisponivel && <option value={RESERVA}>{t('lanc.dinheiroSeparado', { v: dinheiro(viagemSel.saldoReserva, viagemSel.moeda) })}</option>}
                      {opcoesConta(null).map((c) => <option key={c._id} value={c._id}>{c.nome}</option>)}
                    </select>
                  </Campo>
                )}
                {opcoesViagem.length > 0 && (
                  <Campo rotulo={t('lanc.viagem')} className={contas.length ? '' : 'col-span-2'}>
                    <select id="lanc-viagem" className="campo" value={f.viagem} onChange={(e) => setF((x) => ({ ...x, viagem: e.target.value, ...(x.conta === RESERVA ? { conta: '' } : {}) }))}>
                      <option value="">{t('lanc.semViagem')}</option>{opcoesViagem.map((v) => <option key={v._id} value={v._id}>{v.icone} {v.nome}</option>)}
                    </select>
                  </Campo>
                )}
              </div>
            )}
            {outraMoeda && (
              <Campo rotulo={t('lanc.valorConta', { m: contaOrig.moeda })} dica={t('lanc.valorContaDica')}>
                <input id="lanc-valor-conta" className="campo num" inputMode="decimal" value={f.valorConta ?? ''} onChange={(e) => setF((x) => ({ ...x, valorConta: e.target.value }))} placeholder={t('lanc.cambioDoDia')} />
              </Campo>
            )}
            {novo && ehCartao && (
              <Campo rotulo={t('lanc.parcelas')} dica={t('lanc.parcelasDica')}>
                <select id="lanc-parcelas" className="campo" value={f.parcelas} onChange={set('parcelas')}>
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((n) => <option key={n} value={n}>{n === 1 ? '1×' : `${n}× ${dinheiro((lerNumero(f.valor) || 0) / n, f.moeda)}`}</option>)}
                </select>
              </Campo>
            )}
          </>
        )}
        <Campo rotulo={t('comum.nota')}><input id="lanc-nota" className="campo" value={f.nota || ''} onChange={set('nota')} /></Campo>
        {item?.recorrente && <p className="flex items-center gap-2 text-xs text-texto-3"><Icone nome="recorrente" className="h-3.5 w-3.5" />{t('lanc.geradoRecorrencia')}</p>}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {!novo ? (
            <div className="flex flex-wrap gap-1">
              <BotaoConfirmar texto={t('comum.apagarMesmo')} aoConfirmar={() => aoApagar(item._id, false)}>{t('comum.apagar')}</BotaoConfirmar>
              {item.parcela && <BotaoConfirmar texto={t('comum.apagarMesmo')} aoConfirmar={() => aoApagar(item._id, true)}>{t('lanc.apagarParcelas')}</BotaoConfirmar>}
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
