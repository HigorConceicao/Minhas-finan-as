import { useCallback, useEffect, useMemo, useState } from 'react';
import { del, get, post, put } from '../api.js';
import { dataCurta, dinheiro, lerNumero, paraCampo, paraInput } from '../fmt.js';
import { useT } from '../i18n.js';
import { useDados } from '../dados.jsx';
import { Barra, BotaoConfirmar, Campo, Carregando, Modal, Vazio, useAviso } from './ui.jsx';
import { FormLancamento, ItemLancamento } from './Lancamentos.jsx';
import Icone from './Icones.jsx';

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
      </span>
    </button>
  );
}

function DetalheViagem({ id, categorias, aoFechar, aoEditar, aoMudar }) {
  const t = useT();
  const avisar = useAviso();
  const [v, setV] = useState(null);
  const [form, setForm] = useState(null);
  const catMap = useMemo(() => new Map(categorias.map((c) => [c._id, c])), [categorias]);
  const carregar = useCallback(async () => { if (id) setV(await get(`/viagens/${id}`)); }, [id]);
  useEffect(() => { setV(null); carregar().catch((e) => avisar(e.message, 'erro')); }, [carregar, avisar]);
  if (!id) return null;
  const depois = async (msg) => { await Promise.all([carregar(), aoMudar()]); avisar(msg); };

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

          <button className="btn-primario w-full" onClick={() => setForm({ viagem: v._id, moeda: v.moeda })}><Icone nome="mais" className="h-4 w-4" forte />{t('viag.adicionarGasto')}</button>

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
