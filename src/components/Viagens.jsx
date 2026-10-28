import { useCallback, useEffect, useMemo, useState } from 'react';
import { del, get, post, put } from '../api.js';
import { dataCurta, dinheiro, hojeISO, lerNumero, paraCampo, paraInput } from '../fmt.js';
import { useT } from '../i18n.js';
import { useDados } from '../dados.jsx';
import { Barra, BotaoConfirmar, Campo, Carregando, Modal, Segmentado, Vazio, useAviso } from './ui.jsx';
import { FormLancamento, ItemLancamento } from './Lancamentos.jsx';
import Icone from './Icones.jsx';
import { TIPOS_ORIGEM } from './Origem.jsx';

const ESTADO = { ok: 'bg-pos-suave text-pos', alerta: 'bg-aviso-suave text-aviso', estourado: 'bg-neg-suave text-neg', 'sem-orcamento': 'bg-sutil text-texto-2' };
const ICONES = ['✈️', '🏖️', '🏔️', '🚆', '🚗', '🗽', '🏝️', '🎒', '⛺', '🇧🇷', '🇩🇪', '🇮🇹'];
const CORES = ['#e0672b', '#2952eb', '#0d8c54', '#8b5cf6', '#db2777', '#0ea5a4', '#c47a0a', '#475569'];

export default function Viagens({ categorias }) {
  const t = useT();
  const avisar = useAviso();
  const { recarregar: recarregarDados } = useDados();
  const [lista, setLista] = useState(null);
  const [form, setForm] = useState(null);
  const [aberta, setAberta] = useState(null);
  const carregar = useCallback(async () => { setLista(await get('/viagens')); recarregarDados(); }, [recarregarDados]);
  useEffect(() => { carregar().catch((e) => avisar(e.message, 'erro')); }, [carregar, avisar]);
  if (!lista) return <Carregando />;
  const ativas = lista.filter((v) => !v.arquivada), arquivadas = lista.filter((v) => v.arquivada);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-2xl">{t('viag.titulo')}</h2><p className="text-sm text-texto-2">{t('viag.sub')}</p></div>
        <button className="btn-primario" onClick={() => setForm({})}><Icone nome="mais" className="h-4 w-4" forte />{t('viag.nova')}</button>
      </div>
      {!lista.length ? (
        <Vazio icone="seta" titulo={t('viag.vazioTitulo')} texto={t('viag.vazio')} acao={<button className="btn-primario" onClick={() => setForm({})}>{t('viag.nova')}</button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ativas.map((v) => <CartaoViagem key={v._id} v={v} aoAbrir={() => setAberta(v._id)} />)}
        </div>
      )}
      {arquivadas.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-base text-texto-2">{t('viag.arquivadas')}</h3>
          <ul className="cartao divide-y divide-linha overflow-hidden opacity-75">
            {arquivadas.map((v) => (
              <li key={v._id}><button className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-sutil/60" onClick={() => setAberta(v._id)}>
                <span className="text-lg">{v.icone}</span><span className="flex-1 font-semibold">{v.nome}</span><span className="num">{dinheiro(v.gasto, v.moeda)}</span>
              </button></li>
            ))}
          </ul>
        </section>
      )}
      <FormViagem aberto={form !== null} viagem={form} aoFechar={() => setForm(null)}
        aoSalvar={async () => { setForm(null); await carregar(); avisar(t('viag.salva')); }}
        aoApagar={async (id) => { await del(`/viagens/${id}`); setForm(null); setAberta(null); await carregar(); avisar(t('viag.apagada')); }} />
      <DetalheViagem id={aberta} categorias={categorias} aoFechar={() => setAberta(null)} aoEditar={(v) => { setAberta(null); setForm(v); }} aoMudar={carregar} />
    </div>
  );
}

function Periodo({ v }) {
  const t = useT();
  if (!v.inicio) return null;
  return <>{dataCurta(v.inicio)}{v.fim ? ` – ${dataCurta(v.fim)}` : ''}{v.dias ? ` · ${t('viag.dias', { n: v.dias })}` : ''}</>;
}

function CartaoViagem({ v, aoAbrir }) {
  const t = useT();
  return (
    <button className="cartao flex flex-col gap-4 p-5 text-left" onClick={aoAbrir}>
      <span className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `${v.cor}1f` }}>{v.icone}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{v.nome}</span>
          <span className="block text-xs text-texto-3"><Periodo v={v} /></span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="chip bg-sutil text-texto-2">{t(`viag.fase.${v.fase}`)}</span>
          {v.orcamento > 0 && v.estado !== 'ok' && <span className={`chip ${ESTADO[v.estado]}`}>{t(`viag.estado.${v.estado}`)}</span>}
        </span>
      </span>
      <span className="block">
        <span className="mb-2 flex items-end justify-between gap-2">
          <span className="num text-2xl font-extrabold tracking-tight">{dinheiro(v.gasto, v.moeda)}</span>
          {v.orcamento > 0 && <span className="num pb-0.5 text-sm text-texto-3">{t('viag.de')} {dinheiro(v.orcamento, v.moeda)}</span>}
        </span>
        {v.orcamento > 0 && <Barra valor={v.gasto} maximo={v.orcamento} estado={v.estado} />}
        <span className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs font-semibold">
          {v.restante != null && <span className={v.restante < 0 ? 'text-neg' : 'text-texto-2'}>{v.restante < 0 ? t('viag.passou', { v: dinheiro(-v.restante, v.moeda) }) : t('viag.restante', { v: dinheiro(v.restante, v.moeda) })}</span>}
          {v.porDiaRestante != null && v.restante > 0 && <span className="text-texto-3">{t('viag.porDia', { v: dinheiro(v.porDiaRestante, v.moeda) })}</span>}
        </span>
        {v.temReserva && <span className="mt-2 block text-xs font-semibold text-texto-2">{t('viag.separado')}: <span className="num">{dinheiro(v.saldoReserva, v.moeda)}</span></span>}
      </span>
    </button>
  );
}

function DetalheViagem({ id, categorias, aoFechar, aoEditar, aoMudar }) {
  const t = useT();
  const avisar = useAviso();
  const [v, setV] = useState(null);
  const [form, setForm] = useState(null);
  const [reserva, setReserva] = useState(null); // 'separar' | 'devolver'
  const { contas, recarregar } = useDados();
  const { metas } = useDados();
  const nomeConta = (cid) => contas.find((c) => c._id === cid)?.nome || '—';
  // de onde veio o dinheiro: meta/poupança, conta (inclusive cartão) ou saldo do mês
  const nomeOrigem = (r) => (r.meta ? metas.find((m) => m._id === r.meta)?.nome || '—' : r.conta ? nomeConta(r.conta) : t('lanc.saldoDoMesCurto'));
  const catMap = useMemo(() => new Map(categorias.map((c) => [c._id, c])), [categorias]);
  const carregar = useCallback(async () => { if (id) setV(await get(`/viagens/${id}`)); }, [id]);
  useEffect(() => { setV(null); carregar().catch((e) => avisar(e.message, 'erro')); }, [carregar, avisar]);
  if (!id) return null;
  const depois = async (msg) => { await Promise.all([carregar(), aoMudar(), recarregar()]); avisar(msg); };

  return (
    <Modal titulo={v ? `${v.icone} ${v.nome}` : '…'} aberto={!!id} aoFechar={aoFechar}>
      {!v ? <Carregando /> : (
        <div className="space-y-5">
          <div>
            <p className="text-xs text-texto-3"><Periodo v={v} /></p>
            <div className="mb-2 mt-1 flex items-end justify-between gap-2">
              <p className="num text-3xl font-extrabold tracking-tight">{dinheiro(v.gasto, v.moeda)}</p>
              {v.orcamento > 0 && <p className="num pb-1 text-sm text-texto-3">{t('viag.de')} {dinheiro(v.orcamento, v.moeda)}</p>}
            </div>
            {v.orcamento > 0 && <Barra valor={v.gasto} maximo={v.orcamento} estado={v.estado} />}
            {v.restante != null && (
              <p className={`mt-2 text-sm font-semibold ${v.restante < 0 ? 'text-neg' : ''}`}>
                {v.restante < 0 ? t('viag.passou', { v: dinheiro(-v.restante, v.moeda) }) : t('viag.restante', { v: dinheiro(v.restante, v.moeda) })}
                {v.porDiaRestante != null && v.restante > 0 && <span className="font-normal text-texto-2"> · {t('viag.porDia', { v: dinheiro(v.porDiaRestante, v.moeda) })}</span>}
              </p>
            )}
          </div>

          <button className="btn-primario w-full" onClick={() => setForm({ viagem: v._id, moeda: v.moeda, ...(v.temReserva && v.saldoReserva > 0 ? { conta: '__reserva' } : {}) })}><Icone nome="mais" className="h-4 w-4" forte />{t('viag.adicionarGasto')}</button>

          <div className="rounded-2xl border border-linha p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-bold">{t('viag.separado')}</p>
              {v.temReserva && <p className={`num text-lg font-extrabold ${v.saldoReserva < 0 ? 'text-neg' : ''}`}>{dinheiro(v.saldoReserva, v.moeda)}</p>}
            </div>
            {!v.temReserva ? (
              <>
                <p className="mb-3 text-sm text-texto-2">{t('viag.separadoDica')}</p>
                <button className="btn-secundario w-full" onClick={() => setReserva('separar')}>{t('viag.separar')}</button>
              </>
            ) : (
              <>
                <p className="num mb-3 text-xs text-texto-3">{t('viag.separadoResumo', { s: dinheiro(v.reservado, v.moeda), g: dinheiro(v.gastoReserva, v.moeda) })}</p>
                <ul className="mb-3 divide-y divide-linha text-sm">
                  {v.reservas.map((r) => (
                    <li key={r._id} className="flex items-center gap-2 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{!r.meta && !r.conta ? t(r.valor < 0 ? 'viag.devolvidoSaldo' : 'viag.doSaldo') : r.valor < 0 ? t('viag.devolvidoPara', { n: nomeOrigem(r) }) : t('viag.separadoDe', { n: nomeOrigem(r) })}</span>
                        <span className="block text-xs text-texto-3">{dataCurta(r.data)}{r.valorViagem != null && r.conta && !r.meta && <> · {dinheiro(Math.abs(r.valor), contas.find((c) => c._id === r.conta)?.moeda || v.moeda)}</>}</span>
                      </span>
                      <span className={`num font-bold ${r.valor < 0 ? 'text-neg' : 'text-pos'}`}>{r.valor < 0 ? '−' : '+'}{dinheiro(Math.abs(r.valorViagem ?? r.valor), v.moeda)}</span>
                      <BotaoConfirmar className="rounded-full p-2 text-texto-3 hover:bg-neg-suave hover:text-neg" rotulo={t('comum.apagar')} texto={t('comum.apagar')}
                        aoConfirmar={async () => { await del(`/reservas-viagem/${r._id}`); await depois(t('viag.reservaApagada')); }}>
                        <Icone nome="lixo" className="h-4 w-4" />
                      </BotaoConfirmar>
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-secundario" onClick={() => setReserva('separar')}>{t('viag.separarMais')}</button>
                  <button className="btn-secundario" disabled={!(v.saldoReserva > 0)} onClick={() => setReserva('devolver')}>{t('viag.devolver')}</button>
                </div>
              </>
            )}
          </div>

          {v.porCategoria.length > 0 && (
            <div>
              <p className="rotulo mb-2">{t('viag.porCategoria')}</p>
              <ul className="space-y-2.5">
                {v.porCategoria.map((c) => (
                  <li key={c.categoria || 'sem'} className="flex items-center gap-3 text-sm">
                    <span className="w-6 text-center">{c.icone}</span>
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex justify-between gap-2"><span className="truncate font-semibold">{c.nome || t('comum.semCategoria')}</span><span className="num">{dinheiro(c.valor, v.moeda)}</span></span>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-sutil"><span className="block h-full rounded-full" style={{ width: `${Math.max(2, (c.valor / Math.max(v.gasto, 1)) * 100)}%`, background: c.cor }} /></span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {v.porMoeda.length > 0 && (
            <div>
              <p className="rotulo mb-2">{t('viag.porMoeda')}</p>
              <div className="flex flex-wrap gap-2">{v.porMoeda.map((m) => <span key={m.moeda} className="num chip bg-sutil px-3 py-1.5 text-sm text-texto">{dinheiro(m.valor, m.moeda)}</span>)}</div>
              <p className="mt-2 text-xs text-texto-3">{t('viag.cambioNota')}</p>
            </div>
          )}
          <div>
            <p className="rotulo mb-2">{t('viag.lancamentos')}</p>
            {!v.lancamentos.length ? <p className="text-sm text-texto-2">{t('viag.semGastos')}</p> : (
              <ul className="divide-y divide-linha overflow-hidden rounded-2xl border border-linha">
                {v.lancamentos.map((l) => <li key={l._id}><ItemLancamento l={l} cat={catMap.get(l.categoria)} aoAbrir={() => setForm(l)} /></li>)}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-linha pt-4">
            <button className="btn-secundario" onClick={async () => { await put(`/viagens/${v._id}`, { arquivada: !v.arquivada }); await aoMudar(); aoFechar(); }}>{v.arquivada ? t('viag.reativar') : t('viag.arquivar')}</button>
            <button className="btn-secundario" onClick={() => aoEditar(v)}><Icone nome="lapis" className="h-4 w-4" />{t('comum.editar')}</button>
          </div>
        </div>
      )}
      {v && <ModalReserva aberto={!!reserva} modo={reserva} viagem={v} aoFechar={() => setReserva(null)}
        aoSalvar={async (msg) => { setReserva(null); await depois(msg); }} />}
      <FormLancamento aberto={form !== null} item={form} categorias={categorias} aoFechar={() => setForm(null)}
        aoSalvar={async () => { setForm(null); await depois(t('lanc.salvo')); }}
        aoApagar={async (lid, todas) => { await del(`/lancamentos/${lid}${todas ? '?todas=1' : ''}`); setForm(null); await depois(t('lanc.apagado')); }} />
    </Modal>
  );
}

function FormViagem({ aberto, viagem, aoFechar, aoSalvar, aoApagar }) {
  const t = useT();
  const avisar = useAviso();
  const novo = !viagem?._id;
  const [f, setF] = useState({});
  useEffect(() => {
    if (!aberto) return;
    setF(viagem?._id
      ? { ...viagem, orcamento: paraCampo(viagem.orcamento), inicio: paraInput(viagem.inicio), fim: paraInput(viagem.fim) }
      : { nome: '', icone: '✈️', cor: CORES[0], moeda: 'EUR', orcamento: '', inicio: '', fim: '' });
  }, [aberto, viagem]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const salvar = async (e) => {
    e.preventDefault();
    if (!f.nome?.trim()) return avisar(t('viag.deNome'), 'erro');
    const corpo = { nome: f.nome, icone: f.icone, cor: f.cor, moeda: f.moeda, orcamento: f.orcamento === '' ? 0 : lerNumero(f.orcamento) || 0, inicio: f.inicio || null, fim: f.fim || null };
    try { novo ? await post('/viagens', corpo) : await put(`/viagens/${viagem._id}`, corpo); aoSalvar(); }
    catch (err) { avisar(err.message, 'erro'); }
  };
  return (
    <Modal titulo={novo ? t('viag.novaTitulo') : t('viag.editarTitulo')} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo={t('viag.nome')}><input id="viag-nome" className="campo" value={f.nome || ''} onChange={set('nome')} placeholder={t('viag.exNome')} /></Campo>
        <Campo grupo rotulo={t('metas.icone')}>
          <div className="flex flex-wrap gap-1.5">
            {ICONES.map((i) => (
              <button type="button" key={i} aria-pressed={f.icone === i} onClick={() => setF((x) => ({ ...x, icone: i }))}
                className={`grid h-10 w-10 place-items-center rounded-xl text-xl transition ${f.icone === i ? 'bg-marca-suave ring-2 ring-marca' : 'bg-sutil hover:bg-linha'}`}>{i}</button>
            ))}
          </div>
        </Campo>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Campo rotulo={t('viag.orcamento')}><input id="viag-orc" className="campo num text-xl font-bold" inputMode="decimal" value={f.orcamento ?? ''} onChange={set('orcamento')} placeholder="2.500" /></Campo>
          <Campo rotulo={t('comum.moeda')}><select id="viag-moeda" className="campo" value={f.moeda} onChange={set('moeda')}><option>EUR</option><option>BRL</option><option>USD</option></select></Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={t('viag.inicio')}><input id="viag-inicio" type="date" className="campo" value={f.inicio || ''} onChange={set('inicio')} /></Campo>
          <Campo rotulo={t('viag.fim')}><input id="viag-fim" type="date" className="campo" value={f.fim || ''} onChange={set('fim')} /></Campo>
        </div>
        <Campo grupo rotulo={t('metas.cor')}>
          <div className="flex flex-wrap gap-2">
            {CORES.map((c) => (
              <button type="button" key={c} onClick={() => setF((x) => ({ ...x, cor: c }))} aria-label={c} aria-pressed={f.cor === c}
                className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-cartao ${f.cor === c ? 'ring-2 ring-texto' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </Campo>
        <p className="text-xs text-texto-3">{t('viag.dica')}</p>
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {!novo ? <BotaoConfirmar texto={t('viag.apagarConf')} aoConfirmar={() => aoApagar(viagem._id)}>{t('viag.apagar')}</BotaoConfirmar> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
            <button className="btn-primario">{t('comum.salvar')}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Separar dinheiro de uma conta para a viagem, ou devolver o que sobrou */
function ModalReserva({ aberto, modo, viagem, aoFechar, aoSalvar }) {
  const t = useT();
  const avisar = useAviso();
  const { contasAtivas, metasAtivas, recarregar } = useDados();
  const [f, setF] = useState({});
  const [tipo, setTipo] = useState(modo);
  useEffect(() => { if (aberto) recarregar(); }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  const [saldoMes, setSaldoMes] = useState(null);
  const contas = contasAtivas.filter((c) => [...TIPOS_ORIGEM, 'cartao'].includes(c.tipo));
  const metas = metasAtivas.filter((m) => m.guardado > 0 || modo === 'devolver');
  useEffect(() => {
    if (!aberto) return;
    setTipo(modo);
    let ultima = 'saldo';
    try { ultima = localStorage.getItem('mf2-origem-viagem') || 'saldo'; } catch {}
    const valida = ultima === 'saldo' || (ultima.startsWith('meta:') && metasAtivas.some((m) => `meta:${m._id}` === ultima)) || (ultima.startsWith('conta:') && contas.some((c) => `conta:${c._id}` === ultima));
    setF({ valor: modo === 'devolver' ? paraCampo(viagem.saldoReserva) : '', valorConta: '', data: hojeISO(), origem: valida ? ultima : 'saldo', nota: '' });
    get(`/resumo?mes=${hojeISO().slice(0, 7)}&base=${viagem.moeda}`).then((r) => setSaldoMes(r.saldo)).catch(() => {});
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  const devolver = tipo === 'devolver';
  const [qual, id] = String(f.origem || 'saldo').split(':');
  const conta = qual === 'conta' ? contas.find((c) => c._id === id) : null;
  const meta = qual === 'meta' ? metasAtivas.find((m) => m._id === id) : null;
  const v = lerNumero(f.valor) || 0;
  const outraMoeda = conta && conta.moeda !== viagem.moeda;
  // quanto fica na origem depois (só quando a moeda é a mesma da viagem, para não adivinhar câmbio)
  const sinal = devolver ? 1 : -1;
  const depois = qual === 'saldo' && saldoMes != null ? { nome: t('lanc.saldoDoMesCurto'), v: saldoMes + sinal * v, m: viagem.moeda }
    : meta && meta.moeda === viagem.moeda ? { nome: meta.nome, v: meta.guardado + sinal * v, m: meta.moeda }
    : conta && !outraMoeda ? { nome: conta.nome, v: conta.saldo + sinal * v, m: conta.moeda } : null;

  const salvar = async (e) => {
    e.preventDefault();
    if (!(v > 0)) return avisar(t('lanc.informeValor'), 'erro');
    if (devolver && v > viagem.saldoReserva + 0.004) return avisar(t('viag.devolverMais', { v: dinheiro(viagem.saldoReserva, viagem.moeda) }), 'erro');
    const vc = lerNumero(f.valorConta);
    try {
      await post(`/viagens/${viagem._id}/reservas`, {
        valor: devolver ? -v : v, data: f.data, nota: f.nota,
        ...(conta ? { conta: conta._id, valorConta: outraMoeda && vc > 0 ? (devolver ? -vc : vc) : null } : {}),
        ...(meta ? { meta: meta._id } : {}),
      });
      try { localStorage.setItem('mf2-origem-viagem', f.origem); } catch {}
      aoSalvar(t(devolver ? 'viag.devolvido' : 'viag.separadoOk'));
    } catch (err) { avisar(err.message, 'erro'); }
  };
  return (
    <Modal titulo={devolver ? t('viag.devolverTitulo') : t('viag.separarTitulo', { n: viagem.nome })} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {viagem.temReserva && <Segmentado valor={tipo} aoMudar={(k) => { setTipo(k); if (k === 'devolver') setF((x) => ({ ...x, valor: paraCampo(viagem.saldoReserva) })); }}
          opcoes={[['separar', t('viag.separarCurto')], ['devolver', t('viag.devolver')]]} />}
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={`${t('comum.valor')} (${viagem.moeda})`} dica={devolver ? t('viag.sobra', { v: dinheiro(viagem.saldoReserva, viagem.moeda) }) : null}>
            <input id="res-valor" className="campo num text-xl font-bold" inputMode="decimal" value={f.valor ?? ''} onChange={(e) => setF((x) => ({ ...x, valor: e.target.value, valorConta: '' }))} placeholder={t('comum.zero')} autoFocus />
          </Campo>
          <Campo rotulo={t('comum.data')}><input id="res-data" type="date" className="campo" value={f.data || ''} onChange={(e) => setF((x) => ({ ...x, data: e.target.value }))} /></Campo>
        </div>
        <div className="space-y-3 rounded-2xl bg-sutil p-4">
          <Campo rotulo={devolver ? t('orig.paraOnde') : t('orig.deOnde')}>
            <select id="res-origem" className="campo bg-cartao" value={f.origem || 'saldo'} onChange={(e) => setF((x) => ({ ...x, origem: e.target.value, valorConta: '' }))}>
              <option value="saldo">{t('lanc.saldoDoMesCurto')}{saldoMes != null ? ` · ${dinheiro(saldoMes, viagem.moeda)}` : ''}</option>
              {metas.length > 0 && (
                <optgroup label={t('viag.grupoGuardado')}>
                  {metas.map((m) => <option key={m._id} value={`meta:${m._id}`}>{m.icone} {m.nome} · {dinheiro(m.guardado, m.moeda)}</option>)}
                </optgroup>
              )}
              {contas.length > 0 && (
                <optgroup label={t('viag.grupoContas')}>
                  {contas.map((c) => <option key={c._id} value={`conta:${c._id}`}>{c.tipo === 'cartao' ? '💳 ' : ''}{c.nome} · {dinheiro(c.saldo, c.moeda)}</option>)}
                </optgroup>
              )}
            </select>
          </Campo>
          {outraMoeda && (
            <Campo rotulo={devolver ? t('orig.voltaNaConta', { m: conta.moeda }) : t('orig.saiDaConta', { m: conta.moeda })}>
              <input id="res-valor-conta" className="campo num bg-cartao" inputMode="decimal" value={f.valorConta ?? ''} onChange={(e) => setF((x) => ({ ...x, valorConta: e.target.value }))} placeholder={t('lanc.cambioDoDia')} />
            </Campo>
          )}
          {depois && v > 0 && (
            <p className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-texto-2">{t('viag.ficaEm', { n: depois.nome })}</span>
              <span className={`num font-bold ${depois.v < 0 ? 'text-neg' : ''}`}>{dinheiro(depois.v, depois.m)}</span>
            </p>
          )}
          <p className="text-xs text-texto-3">{t(`viag.origemDica.${devolver ? 'volta' : qual}`)}</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
          <button className="btn-primario">{devolver ? t('viag.devolver') : t('viag.separarCurto')}</button>
        </div>
      </form>
    </Modal>
  );
}
