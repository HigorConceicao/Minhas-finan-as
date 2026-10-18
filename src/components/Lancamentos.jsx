import { useCallback, useEffect, useMemo, useState } from 'react';
import { del, get, post, put } from '../api.js';
import { data, dinheiro, hojeISO, lerNumero, paraInput } from '../fmt.js';
import { BotaoConfirmar, Campo, Carregando, Modal, SeletorMes, Vazio, useAviso } from './ui.jsx';

export default function Lancamentos({ mes, setMes, categorias, novoSinal, aoConsumirNovo }) {
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
    const t = {};
    for (const l of filtrada) {
      t[l.moeda] ??= { r: 0, d: 0 };
      t[l.moeda][l.tipo === 'receita' ? 'r' : 'd'] += l.valor;
    }
    return t;
  }, [filtrada]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorMes mes={mes} aoMudar={setMes} />
        <button className="btn-primario" onClick={() => setForm({})}>+ Novo lançamento</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input className="campo max-w-xs flex-1" placeholder="Buscar descrição…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="campo w-auto" value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categorias.map((c) => <option key={c._id} value={c._id}>{c.icone} {c.nome}</option>)}
          <option value="sem">Sem categoria</option>
        </select>
      </div>

      {Object.keys(totais).length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {Object.entries(totais).map(([moeda, t]) => (
            <span key={moeda} className="num">
              <span className="text-verde">+{dinheiro(t.r, moeda)}</span> · <span className="text-vermelho">−{dinheiro(t.d, moeda)}</span>
            </span>
          ))}
        </div>
      )}

      {!lista ? <Carregando /> : !filtrada.length ? (
        <Vazio titulo="Nenhum lançamento" texto={lista.length ? 'Nada com esse filtro.' : 'Registre receitas e despesas deste mês. Contas fixas ficam melhor em Recorrentes.'}
          acao={!lista.length && <button className="btn-primario" onClick={() => setForm({})}>Adicionar</button>} />
      ) : (
        <div className="folha divide-y divide-linha/70 overflow-hidden">
          {grupos.map(([dia, itens]) => (
            <div key={dia}>
              <p className="rotulo bg-papel-escuro/40 px-4 py-1.5">{data(dia)}</p>
              <ul>
                {itens.map((l) => {
                  const c = catMap.get(l.categoria);
                  return (
                    <li key={l._id}>
                      <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-papel-escuro/30" onClick={() => setForm(l)}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base" style={{ background: `${c?.cor || '#7d7468'}22` }}>{c?.icone || '•'}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{l.descricao}</span>
                          <span className="block text-xs text-tinta-fraca">
                            {c?.nome || 'Sem categoria'}{l.recorrente && ' · 🔁 recorrente'}
                          </span>
                        </span>
                        <span className={`num text-sm font-medium ${l.tipo === 'receita' ? 'text-verde' : ''}`}>
                          {l.tipo === 'receita' ? '+' : '−'}{dinheiro(l.valor, l.moeda)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <FormLancamento aberto={form !== null} item={form} categorias={categorias} aoFechar={() => setForm(null)}
        aoSalvar={async () => { setForm(null); await carregar(); avisar('Lançamento salvo'); }}
        aoApagar={async (id) => { await del(`/lancamentos/${id}`); setForm(null); await carregar(); avisar('Lançamento apagado'); }} />
    </div>
  );
}

export function FormLancamento({ aberto, item, categorias, aoFechar, aoSalvar, aoApagar }) {
  const avisar = useAviso();
  const novo = !item?._id;
  const [f, setF] = useState({});
  useEffect(() => {
    if (!aberto) return;
    const ultimaMoeda = (() => { try { return localStorage.getItem('mf2-moeda'); } catch { return null; } })();
    setF(item?._id
      ? { ...item, valor: String(item.valor).replace('.', ','), data: paraInput(item.data), categoria: item.categoria || '' }
      : { tipo: 'despesa', descricao: '', valor: '', moeda: ultimaMoeda || 'EUR', data: hojeISO(), categoria: '', nota: '' });
  }, [aberto, item]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const cats = categorias.filter((c) => c.tipo === f.tipo);

  const salvar = async (e) => {
    e.preventDefault();
    const valor = lerNumero(f.valor);
    if (!f.descricao?.trim()) return avisar('Descreva o lançamento', 'erro');
    if (!(valor > 0)) return avisar('Informe um valor', 'erro');
    const corpo = { tipo: f.tipo, descricao: f.descricao, valor, moeda: f.moeda, data: f.data, categoria: f.categoria || null, nota: f.nota };
    try {
      novo ? await post('/lancamentos', corpo) : await put(`/lancamentos/${item._id}`, corpo);
      try { localStorage.setItem('mf2-moeda', f.moeda); } catch {}
      aoSalvar();
    } catch (err) { avisar(err.message, 'erro'); }
  };

  return (
    <Modal titulo={novo ? 'Novo lançamento' : 'Editar lançamento'} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[['despesa', 'Despesa'], ['receita', 'Receita']].map(([k, t]) => (
            <button type="button" key={k} onClick={() => setF((x) => ({ ...x, tipo: k, categoria: '' }))}
              className={`rounded-lg border px-2 py-2 text-sm ${f.tipo === k ? (k === 'receita' ? 'border-verde bg-verde text-white' : 'border-couro bg-couro text-papel-claro') : 'border-linha bg-white/60'}`}>{t}</button>
          ))}
        </div>
        <Campo rotulo="Descrição"><input className="campo" value={f.descricao || ''} onChange={set('descricao')} autoFocus={novo} /></Campo>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Campo rotulo="Valor"><input className="campo num" inputMode="decimal" value={f.valor ?? ''} onChange={set('valor')} placeholder="0,00" /></Campo>
          <Campo rotulo="Moeda"><select className="campo" value={f.moeda} onChange={set('moeda')}><option>EUR</option><option>BRL</option><option>USD</option></select></Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data"><input type="date" className="campo" value={f.data || ''} onChange={set('data')} /></Campo>
          <Campo rotulo="Categoria">
            <select className="campo" value={f.categoria} onChange={set('categoria')}>
              <option value="">Sem categoria</option>
              {cats.map((c) => <option key={c._id} value={c._id}>{c.icone} {c.nome}</option>)}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Nota"><input className="campo" value={f.nota || ''} onChange={set('nota')} /></Campo>
        {item?.recorrente && <p className="text-xs text-tinta-fraca">🔁 Gerado por uma recorrência. Alterar aqui muda só este mês.</p>}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {!novo ? <BotaoConfirmar texto="Apagar mesmo?" aoConfirmar={() => aoApagar(item._id)}>Apagar</BotaoConfirmar> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-secundario" onClick={aoFechar}>Cancelar</button>
            <button className="btn-primario">Salvar</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
