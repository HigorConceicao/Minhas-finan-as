import { useCallback, useEffect, useMemo, useState } from 'react';
import { del, get, post, put } from '../api.js';
import { data, dinheiro, hojeISO, lerNumero, paraCampo, paraInput } from '../fmt.js';
import { useT } from '../i18n.js';
import { BotaoConfirmar, Campo, Carregando, IconeCategoria, Modal, Segmentado, SeletorMes, Vazio, useAviso } from './ui.jsx';
import Icone from './Icones.jsx';

export default function Lancamentos({ mes, setMes, categorias, novoSinal, aoConsumirNovo }) {
  const t = useT();
  const avisar = useAviso();
  const [lista, setLista] = useState(null);
  const [form, setForm] = useState(null);
  const [filtroCat, setFiltroCat] = useState('');
  const [busca, setBusca] = useState('');

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
      r[l.moeda] ??= { r: 0, d: 0 };
      r[l.moeda][l.tipo === 'receita' ? 'r' : 'd'] += l.valor;
    }
    return r;
  }, [filtrada]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorMes mes={mes} aoMudar={setMes} />
        <button className="btn-primario" onClick={() => setForm({})}><Icone nome="mais" className="h-4 w-4" forte />{t('lanc.novo').replace('+ ', '')}</button>
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
              <span className="text-pos">+{dinheiro(x.r, moeda)}</span><span className="text-neg">−{dinheiro(x.d, moeda)}</span>
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
                {itens.map((l) => {
                  const c = catMap.get(l.categoria);
                  return (
                    <li key={l._id}>
                      <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-sutil/60" onClick={() => setForm(l)}>
                        <IconeCategoria cor={c?.cor} icone={c?.icone} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{l.descricao}</span>
                          <span className="flex items-center gap-1 text-xs text-texto-3">
                            {c?.nome || t('comum.semCategoria')}
                            {l.recorrente && <><span aria-hidden>·</span><Icone nome="recorrente" className="h-3 w-3" />{t('lanc.recorrente')}</>}
                          </span>
                        </span>
                        <span className={`num text-sm font-bold ${l.tipo === 'receita' ? 'text-pos' : ''}`}>
                          {l.tipo === 'receita' ? '+' : '−'}{dinheiro(l.valor, l.moeda)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <FormLancamento aberto={form !== null} item={form} categorias={categorias} aoFechar={() => setForm(null)}
        aoSalvar={async () => { setForm(null); await carregar(); avisar(t('lanc.salvo')); }}
        aoApagar={async (id) => { await del(`/lancamentos/${id}`); setForm(null); await carregar(); avisar(t('lanc.apagado')); }} />
    </div>
  );
}

export function FormLancamento({ aberto, item, categorias, aoFechar, aoSalvar, aoApagar }) {
  const t = useT();
  const avisar = useAviso();
  const novo = !item?._id;
  const [f, setF] = useState({});
  useEffect(() => {
    if (!aberto) return;
    const ultimaMoeda = (() => { try { return localStorage.getItem('mf2-moeda'); } catch { return null; } })();
    setF(item?._id
      ? { ...item, valor: paraCampo(item.valor), data: paraInput(item.data), categoria: item.categoria || '' }
      : { tipo: 'despesa', descricao: '', valor: '', moeda: ultimaMoeda || 'EUR', data: hojeISO(), categoria: '', nota: '' });
  }, [aberto, item]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const cats = categorias.filter((c) => c.tipo === f.tipo);

  const salvar = async (e) => {
    e.preventDefault();
    const valor = lerNumero(f.valor);
    if (!f.descricao?.trim()) return avisar(t('lanc.descreva'), 'erro');
    if (!(valor > 0)) return avisar(t('lanc.informeValor'), 'erro');
    const corpo = { tipo: f.tipo, descricao: f.descricao, valor, moeda: f.moeda, data: f.data, categoria: f.categoria || null, nota: f.nota };
    try {
      novo ? await post('/lancamentos', corpo) : await put(`/lancamentos/${item._id}`, corpo);
      try { localStorage.setItem('mf2-moeda', f.moeda); } catch {}
      aoSalvar();
    } catch (err) { avisar(err.message, 'erro'); }
  };

  return (
    <Modal titulo={novo ? t('lanc.novoTitulo') : t('lanc.editarTitulo')} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Segmentado opcoes={[['despesa', t('comum.despesa')], ['receita', t('comum.receita')]]} valor={f.tipo}
          aoMudar={(k) => setF((x) => ({ ...x, tipo: k, categoria: '' }))} />
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Campo rotulo={t('comum.valor')}>
            <input id="lanc-valor" className="campo num text-2xl font-bold" inputMode="decimal" value={f.valor ?? ''} onChange={set('valor')} placeholder={t('comum.zero')} autoFocus={novo} />
          </Campo>
          <Campo rotulo={t('comum.moeda')}><select id="lanc-moeda" className="campo" value={f.moeda} onChange={set('moeda')}><option>EUR</option><option>BRL</option><option>USD</option></select></Campo>
        </div>
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
        <Campo rotulo={t('comum.nota')}><input id="lanc-nota" className="campo" value={f.nota || ''} onChange={set('nota')} /></Campo>
        {item?.recorrente && <p className="flex items-center gap-2 text-xs text-texto-3"><Icone nome="recorrente" className="h-3.5 w-3.5" />{t('lanc.geradoRecorrencia')}</p>}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {!novo ? <BotaoConfirmar texto={t('comum.apagarMesmo')} aoConfirmar={() => aoApagar(item._id)}>{t('comum.apagar')}</BotaoConfirmar> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
            <button className="btn-primario">{t('comum.salvar')}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
