import { useCallback, useEffect, useMemo, useState } from 'react';
import { del, get, post, put } from '../api.js';
import { data, dinheiro, hojeISO, lerNumero, paraInput } from '../fmt.js';
import { Campo, Carregando, Modal, Vazio, useAviso } from './ui.jsx';

const FREQ = { mensal: 'todo mês', trimestral: 'a cada 3 meses', anual: 'todo ano' };

export default function Recorrentes({ categorias, aoMudar }) {
  const avisar = useAviso();
  const [lista, setLista] = useState(null);
  const [form, setForm] = useState(null);
  const carregar = useCallback(async () => setLista(await get('/recorrentes')), []);
  useEffect(() => { carregar().catch((e) => avisar(e.message, 'erro')); }, [carregar, avisar]);
  const catMap = useMemo(() => new Map(categorias.map((c) => [c._id, c])), [categorias]);

  const totais = useMemo(() => {
    const t = {};
    for (const r of (lista || []).filter((x) => x.ativo)) {
      const fator = r.frequencia === 'anual' ? 1 / 12 : r.frequencia === 'trimestral' ? 1 / 3 : 1;
      t[r.moeda] ??= { r: 0, d: 0 };
      t[r.moeda][r.tipo === 'receita' ? 'r' : 'd'] += r.valor * fator;
    }
    return t;
  }, [lista]);

  const depois = async (msg) => { setForm(null); await carregar(); aoMudar?.(); avisar(msg); };

  if (!lista) return <Carregando />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl">Recorrentes</h2>
          <p className="text-sm text-tinta-suave">Entram sozinhos como lançamento na data de cada mês.</p>
        </div>
        <button className="btn-primario" onClick={() => setForm({})}>+ Nova recorrência</button>
      </div>

      {Object.keys(totais).length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(totais).map(([moeda, t]) => (
            <div key={moeda} className="folha p-4">
              <p className="rotulo">Por mês · {moeda}</p>
              <p className="num mt-1 text-verde">+{dinheiro(t.r, moeda)}</p>
              <p className="num text-vermelho">−{dinheiro(t.d, moeda)}</p>
            </div>
          ))}
        </div>
      )}

      {!lista.length ? (
        <Vazio titulo="Nenhuma recorrência" texto="Aluguel, salário, academia, streaming… Cadastre uma vez e o app lança todo mês." acao={<button className="btn-primario" onClick={() => setForm({})}>Cadastrar</button>} />
      ) : (
        <ul className="folha divide-y divide-linha/70 overflow-hidden">
          {lista.map((r) => {
            const c = catMap.get(r.categoria);
            return (
              <li key={r._id}>
                <button className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-papel-escuro/30 ${r.ativo ? '' : 'opacity-50'}`} onClick={() => setForm(r)}>
                  <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border border-linha bg-papel-claro leading-none">
                    <span className="rotulo text-[9px]">dia</span><span className="num text-base">{r.diaDoMes}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.descricao}</span>
                    <span className="block text-xs text-tinta-fraca">
                      {c ? `${c.icone} ${c.nome} · ` : ''}{FREQ[r.frequencia]}{r.ativo ? (r.proxima ? ` · próximo ${data(r.proxima)}` : ' · encerrada') : ' · pausada'}
                    </span>
                  </span>
                  <span className={`num text-sm font-medium ${r.tipo === 'receita' ? 'text-verde' : ''}`}>{r.tipo === 'receita' ? '+' : '−'}{dinheiro(r.valor, r.moeda)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <FormRecorrente aberto={form !== null} item={form} categorias={categorias} aoFechar={() => setForm(null)}
        aoSalvar={() => depois('Recorrência salva')}
        aoApagar={async (id, apagarLancs) => { await del(`/recorrentes/${id}${apagarLancs ? '?apagarLancamentos=1' : ''}`); depois('Recorrência apagada'); }} />
    </div>
  );
}

function FormRecorrente({ aberto, item, categorias, aoFechar, aoSalvar, aoApagar }) {
  const avisar = useAviso();
  const novo = !item?._id;
  const [f, setF] = useState({});
  const [apagando, setApagando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setApagando(false);
    setF(item?._id
      ? { ...item, valor: String(item.valor).replace('.', ','), inicio: paraInput(item.inicio), fim: paraInput(item.fim), categoria: item.categoria || '' }
      : { tipo: 'despesa', descricao: '', valor: '', moeda: 'EUR', categoria: '', frequencia: 'mensal', diaDoMes: new Date().getDate(), inicio: hojeISO(), fim: '', ativo: true });
  }, [aberto, item]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    const valor = lerNumero(f.valor);
    const dia = Number(f.diaDoMes);
    if (!f.descricao?.trim()) return avisar('Descreva a recorrência', 'erro');
    if (!(valor > 0)) return avisar('Informe um valor', 'erro');
    if (!(dia >= 1 && dia <= 31)) return avisar('Dia do mês entre 1 e 31', 'erro');
    const corpo = { tipo: f.tipo, descricao: f.descricao, valor, moeda: f.moeda, categoria: f.categoria || null, frequencia: f.frequencia, diaDoMes: dia, inicio: f.inicio, fim: f.fim || null, ativo: f.ativo };
    try { novo ? await post('/recorrentes', corpo) : await put(`/recorrentes/${item._id}`, corpo); aoSalvar(); }
    catch (err) { avisar(err.message, 'erro'); }
  };

  return (
    <Modal titulo={novo ? 'Nova recorrência' : 'Editar recorrência'} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[['despesa', 'Despesa'], ['receita', 'Receita']].map(([k, t]) => (
            <button type="button" key={k} onClick={() => setF((x) => ({ ...x, tipo: k, categoria: '' }))}
              className={`rounded-lg border px-2 py-2 text-sm ${f.tipo === k ? 'border-couro bg-couro text-papel-claro' : 'border-linha bg-white/60'}`}>{t}</button>
          ))}
        </div>
        <Campo rotulo="Descrição"><input className="campo" value={f.descricao || ''} onChange={set('descricao')} placeholder="Ex.: Aluguel" /></Campo>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Campo rotulo="Valor"><input className="campo num" inputMode="decimal" value={f.valor ?? ''} onChange={set('valor')} placeholder="0,00" /></Campo>
          <Campo rotulo="Moeda"><select className="campo" value={f.moeda} onChange={set('moeda')}><option>EUR</option><option>BRL</option><option>USD</option></select></Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Frequência">
            <select className="campo" value={f.frequencia} onChange={set('frequencia')}><option value="mensal">Mensal</option><option value="trimestral">Trimestral</option><option value="anual">Anual</option></select>
          </Campo>
          <Campo rotulo="Dia do mês" dica="31 = último dia do mês"><input type="number" min="1" max="31" className="campo num" value={f.diaDoMes ?? ''} onChange={set('diaDoMes')} /></Campo>
        </div>
        <Campo rotulo="Categoria">
          <select className="campo" value={f.categoria} onChange={set('categoria')}>
            <option value="">Sem categoria</option>
            {categorias.filter((c) => c.tipo === f.tipo).map((c) => <option key={c._id} value={c._id}>{c.icone} {c.nome}</option>)}
          </select>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Começa em" dica="Meses passados são lançados ao salvar."><input type="date" className="campo" value={f.inicio || ''} onChange={set('inicio')} /></Campo>
          <Campo rotulo="Termina em (opcional)"><input type="date" className="campo" value={f.fim || ''} onChange={set('fim')} /></Campo>
        </div>
        {!novo && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.ativo} onChange={(e) => setF((x) => ({ ...x, ativo: e.target.checked }))} className="h-4 w-4 accent-couro" />
            Ativa (desmarque para pausar)
          </label>
        )}
        {apagando ? (
          <div className="rounded-lg bg-vermelho-claro p-3 text-sm">
            <p className="mb-2">E os lançamentos que ela já gerou?</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secundario" onClick={() => aoApagar(item._id, false)}>Manter lançamentos</button>
              <button type="button" className="btn bg-vermelho text-white" onClick={() => aoApagar(item._id, true)}>Apagar também</button>
              <button type="button" className="btn" onClick={() => setApagando(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            {!novo ? <button type="button" className="btn-perigo" onClick={() => setApagando(true)}>Apagar</button> : <span />}
            <div className="flex gap-2">
              <button type="button" className="btn-secundario" onClick={aoFechar}>Cancelar</button>
              <button className="btn-primario">Salvar</button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
