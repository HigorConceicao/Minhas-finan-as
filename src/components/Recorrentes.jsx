import { useCallback, useEffect, useMemo, useState } from 'react';
import { del, get, post, put } from '../api.js';
import { dataCurta, dinheiro, hojeISO, lerNumero, paraCampo, paraInput } from '../fmt.js';
import { useT } from '../i18n.js';
import { Campo, Carregando, Modal, Segmentado, Vazio, useAviso } from './ui.jsx';
import Icone from './Icones.jsx';
import { useDados } from '../dados.jsx';

export default function Recorrentes({ categorias, aoMudar }) {
  const t = useT();
  const avisar = useAviso();
  const [lista, setLista] = useState(null);
  const [form, setForm] = useState(null);
  const carregar = useCallback(async () => setLista(await get('/recorrentes')), []);
  useEffect(() => { carregar().catch((e) => avisar(e.message, 'erro')); }, [carregar, avisar]);
  const catMap = useMemo(() => new Map(categorias.map((c) => [c._id, c])), [categorias]);

  const totais = useMemo(() => {
    const r = {};
    for (const x of (lista || []).filter((y) => y.ativo)) {
      const fator = x.frequencia === 'anual' ? 1 / 12 : x.frequencia === 'trimestral' ? 1 / 3 : 1;
      r[x.moeda] ??= { r: 0, d: 0 };
      r[x.moeda][x.tipo === 'receita' ? 'r' : 'd'] += x.valor * fator;
    }
    return r;
  }, [lista]);

  const depois = async (msg) => { setForm(null); await carregar(); aoMudar?.(); avisar(msg); };

  if (!lista) return <Carregando />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl">{t('rec.titulo')}</h2>
          <p className="text-sm text-texto-2">{t('rec.sub')}</p>
        </div>
        <button className="btn-primario" onClick={() => setForm({})}><Icone nome="mais" className="h-4 w-4" forte />{t('rec.nova').replace('+ ', '')}</button>
      </div>

      {Object.keys(totais).length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(totais).map(([moeda, x]) => (
            <div key={moeda} className="cartao p-4">
              <p className="rotulo">{t('rec.porMes', { m: moeda })}</p>
              <p className="num mt-1 font-bold text-pos">+{dinheiro(x.r, moeda)}</p>
              <p className="num font-bold text-neg">−{dinheiro(x.d, moeda)}</p>
            </div>
          ))}
        </div>
      )}

      {!lista.length ? (
        <Vazio icone="recorrente" titulo={t('rec.nenhuma')} texto={t('rec.vazio')} acao={<button className="btn-primario" onClick={() => setForm({})}>{t('rec.cadastrar')}</button>} />
      ) : (
        <ul className="cartao divide-y divide-linha overflow-hidden">
          {lista.map((r) => {
            const c = catMap.get(r.categoria);
            return (
              <li key={r._id}>
                <button className={`flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-sutil/60 ${r.ativo ? '' : 'opacity-50'}`} onClick={() => setForm(r)}>
                  <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl bg-sutil leading-none">
                    <span className="text-[9px] font-bold uppercase text-texto-3">{t('rec.dia')}</span><span className="num text-base font-extrabold">{r.diaDoMes}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{r.descricao}</span>
                    <span className="block truncate text-xs text-texto-3">
                      {c ? `${c.icone} ${c.nome} · ` : ''}{t(`rec.freq.${r.frequencia}`)}{' · '}
                      {r.ativo ? (r.proxima ? t('rec.proximo', { d: dataCurta(r.proxima) }) : t('rec.encerrada')) : t('rec.pausada')}
                    </span>
                  </span>
                  <span className={`num text-sm font-bold ${r.tipo === 'receita' ? 'text-pos' : ''}`}>{r.tipo === 'receita' ? '+' : '−'}{dinheiro(r.valor, r.moeda)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <FormRecorrente aberto={form !== null} item={form} categorias={categorias} aoFechar={() => setForm(null)}
        aoSalvar={() => depois(t('rec.salva'))}
        aoApagar={async (id, apagarLancs) => { await del(`/recorrentes/${id}${apagarLancs ? '?apagarLancamentos=1' : ''}`); depois(t('rec.apagada')); }} />
    </div>
  );
}

function FormRecorrente({ aberto, item, categorias, aoFechar, aoSalvar, aoApagar }) {
  const t = useT();
  const avisar = useAviso();
  const novo = !item?._id;
  const [f, setF] = useState({});
  const [apagando, setApagando] = useState(false);
  const { contasAtivas } = useDados();
  useEffect(() => {
    if (!aberto) return;
    setApagando(false);
    setF(item?._id
      ? { ...item, valor: paraCampo(item.valor), inicio: paraInput(item.inicio), fim: paraInput(item.fim), categoria: item.categoria || '', conta: item.conta || '' }
      : { tipo: 'despesa', descricao: '', valor: '', moeda: 'EUR', categoria: '', conta: '', frequencia: 'mensal', diaDoMes: new Date().getDate(), inicio: hojeISO(), fim: '', ativo: true });
  }, [aberto, item]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    const valor = lerNumero(f.valor);
    const dia = Number(f.diaDoMes);
    if (!f.descricao?.trim()) return avisar(t('rec.descreva'), 'erro');
    if (!(valor > 0)) return avisar(t('lanc.informeValor'), 'erro');
    if (!(dia >= 1 && dia <= 31)) return avisar(t('rec.diaInvalido'), 'erro');
    const corpo = { tipo: f.tipo, descricao: f.descricao, valor, moeda: f.moeda, categoria: f.categoria || null, conta: f.conta || null, frequencia: f.frequencia, diaDoMes: dia, inicio: f.inicio, fim: f.fim || null, ativo: f.ativo };
    try { novo ? await post('/recorrentes', corpo) : await put(`/recorrentes/${item._id}`, corpo); aoSalvar(); }
    catch (err) { avisar(err.message, 'erro'); }
  };

  return (
    <Modal titulo={novo ? t('rec.novaTitulo') : t('rec.editarTitulo')} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Segmentado opcoes={[['despesa', t('comum.despesa')], ['receita', t('comum.receita')]]} valor={f.tipo} aoMudar={(k) => setF((x) => ({ ...x, tipo: k, categoria: '' }))} />
        <Campo rotulo={t('comum.descricao')}><input id="rec-desc" className="campo" value={f.descricao || ''} onChange={set('descricao')} placeholder={t('rec.exemplo')} /></Campo>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Campo rotulo={t('comum.valor')}><input id="rec-valor" className="campo num" inputMode="decimal" value={f.valor ?? ''} onChange={set('valor')} placeholder={t('comum.zero')} /></Campo>
          <Campo rotulo={t('comum.moeda')}><select id="rec-moeda" className="campo" value={f.moeda} onChange={set('moeda')}><option>EUR</option><option>BRL</option><option>USD</option></select></Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={t('rec.frequencia')}>
            <select id="rec-freq" className="campo" value={f.frequencia} onChange={set('frequencia')}>
              <option value="mensal">{t('rec.mensal')}</option><option value="trimestral">{t('rec.trimestral')}</option><option value="anual">{t('rec.anual')}</option>
            </select>
          </Campo>
          <Campo rotulo={t('rec.diaDoMes')} dica={t('rec.ultimoDia')}><input id="rec-dia" type="number" min="1" max="31" className="campo num" value={f.diaDoMes ?? ''} onChange={set('diaDoMes')} /></Campo>
        </div>
        <Campo rotulo={t('comum.categoria')}>
          <select id="rec-cat" className="campo" value={f.categoria} onChange={set('categoria')}>
            <option value="">{t('comum.semCategoria')}</option>
            {categorias.filter((c) => c.tipo === f.tipo).map((c) => <option key={c._id} value={c._id}>{c.icone} {c.nome}</option>)}
          </select>
        </Campo>
        {contasAtivas.length > 0 && (
          <Campo rotulo={t('lanc.conta')}>
            <select id="rec-conta" className="campo" value={f.conta || ''} onChange={(e) => { const c = contasAtivas.find((x) => x._id === e.target.value); setF((x) => ({ ...x, conta: e.target.value, moeda: c?.moeda || x.moeda })); }}>
              <option value="">{t('lanc.semConta')}</option>
              {contasAtivas.filter((c) => c.tipo !== 'investimento').map((c) => <option key={c._id} value={c._id}>{c.nome}</option>)}
            </select>
          </Campo>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={t('rec.comeca')} dica={t('rec.comecaDica')}><input id="rec-inicio" type="date" className="campo" value={f.inicio || ''} onChange={set('inicio')} /></Campo>
          <Campo rotulo={t('rec.termina')}><input id="rec-fim" type="date" className="campo" value={f.fim || ''} onChange={set('fim')} /></Campo>
        </div>
        {!novo && (
          <label className="flex items-center gap-3 rounded-2xl bg-sutil p-3 text-sm font-semibold">
            <input id="rec-ativo" type="checkbox" checked={f.ativo} onChange={(e) => setF((x) => ({ ...x, ativo: e.target.checked }))} className="h-5 w-5 accent-[rgb(var(--marca))]" />
            {t('rec.ativa')}
          </label>
        )}
        {apagando ? (
          <div className="rounded-2xl bg-neg-suave p-4 text-sm">
            <p className="mb-3 font-semibold">{t('rec.eOsLanc')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secundario" onClick={() => aoApagar(item._id, false)}>{t('rec.manter')}</button>
              <button type="button" className="btn bg-neg text-cartao" onClick={() => aoApagar(item._id, true)}>{t('rec.apagarTambem')}</button>
              <button type="button" className="btn" onClick={() => setApagando(false)}>{t('comum.cancelar')}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            {!novo ? <button type="button" className="btn-perigo" onClick={() => setApagando(true)}>{t('comum.apagar')}</button> : <span />}
            <div className="flex gap-2">
              <button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
              <button className="btn-primario">{t('comum.salvar')}</button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
