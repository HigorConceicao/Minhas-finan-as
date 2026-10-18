import { useEffect, useState } from 'react';
import { del, post, put } from '../api.js';
import { dinheiro, lerNumero, pct } from '../fmt.js';
import { Barra, BotaoConfirmar, Campo, Carregando, Modal, SeletorMes, useAviso } from './ui.jsx';

const ESTADO = {
  ok: { t: 'Dentro', c: 'bg-verde-claro text-verde' },
  alerta: { t: 'Atenção', c: 'bg-ambar-claro text-ambar' },
  estourado: { t: 'Estourado', c: 'bg-vermelho-claro text-vermelho' },
};

export default function Orcamento({ mes, setMes, base, resumo, categorias, recarregar }) {
  const avisar = useAviso();
  const [form, setForm] = useState(null);
  if (!resumo) return <Carregando />;

  const comLimite = resumo.orcamentos.filter((o) => o.limite);
  const semLimite = resumo.orcamentos.filter((o) => !o.limite);
  const restante = resumo.totalOrcado - resumo.gastoOrcado;
  const receitas = categorias.filter((c) => c.tipo === 'receita');
  const abrir = (id) => setForm(categorias.find((c) => c._id === id) || {});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorMes mes={mes} aoMudar={setMes} />
        <button className="btn-secundario" onClick={() => setForm({})}>+ Categoria</button>
      </div>

      <section className="folha p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="rotulo">Orçamento do mês</p>
            <p className="num mt-1 text-2xl">{dinheiro(resumo.gastoOrcado, base)} <span className="text-base text-tinta-fraca">de {dinheiro(resumo.totalOrcado, base)}</span></p>
          </div>
          <p className={`num text-sm ${restante >= 0 ? 'text-verde' : 'text-vermelho'}`}>
            {restante >= 0 ? `Restam ${dinheiro(restante, base)}` : `Excedido em ${dinheiro(-restante, base)}`}
          </p>
        </div>
        <div className="mt-3">
          <Barra valor={resumo.gastoOrcado} maximo={resumo.totalOrcado || 1}
            estado={resumo.gastoOrcado > resumo.totalOrcado ? 'estourado' : resumo.gastoOrcado / (resumo.totalOrcado || 1) > 0.8 ? 'alerta' : 'ok'} />
        </div>
        {resumo.fracaoDoMes > 0 && resumo.fracaoDoMes < 1 && (
          <p className="mt-2 text-xs text-tinta-fraca">{pct(resumo.fracaoDoMes * 100, 0)} do mês já passou · a linha tracejada mostra onde cada categoria deve terminar no ritmo atual.</p>
        )}
      </section>

      {comLimite.length > 0 && (
        <section className="folha divide-y divide-linha/70">
          {comLimite.map((o) => (
            <button key={o.categoria} className="block w-full px-4 py-3 text-left hover:bg-papel-escuro/30" onClick={() => abrir(o.categoria)}>
              <div className="mb-1.5 flex items-center gap-2">
                <span>{o.icone}</span>
                <span className="flex-1 text-sm font-medium">{o.nome}</span>
                <span className={`chip ${ESTADO[o.estado].c}`}>{ESTADO[o.estado].t}</span>
              </div>
              <Barra valor={o.gasto} maximo={o.limite} estado={o.estado} ritmo={o.ritmo} />
              <div className="num mt-1.5 flex justify-between text-xs text-tinta-suave">
                <span>{dinheiro(o.gasto, base)} de {dinheiro(o.limite, base)} ({pct(o.pct, 0)})</span>
                <span className={o.restante < 0 ? 'text-vermelho' : ''}>{o.restante < 0 ? `+${dinheiro(-o.restante, base)}` : `resta ${dinheiro(o.restante, base)}`}</span>
              </div>
              {o.ritmo != null && o.ritmo > o.limite && o.estado !== 'estourado' && resumo.fracaoDoMes < 1 && (
                <p className="mt-1 text-xs text-ambar">No ritmo atual termina o mês em {dinheiro(o.ritmo, base)}.</p>
              )}
            </button>
          ))}
        </section>
      )}

      <section>
        <h3 className="mb-2 text-lg">Sem orçamento definido</h3>
        <div className="folha divide-y divide-linha/70">
          {semLimite.map((o) => (
            <button key={o.categoria} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-papel-escuro/30" onClick={() => abrir(o.categoria)}>
              <span>{o.icone}</span><span className="flex-1">{o.nome}</span>
              <span className="num text-tinta-suave">{dinheiro(o.gasto, base)}</span>
              <span className="text-xs text-couro">definir →</span>
            </button>
          ))}
          {resumo.semCategoria > 0 && (
            <p className="flex items-center gap-2 px-4 py-2.5 text-sm text-tinta-suave"><span>•</span><span className="flex-1">Sem categoria</span><span className="num">{dinheiro(resumo.semCategoria, base)}</span></p>
          )}
          {!semLimite.length && !resumo.semCategoria && <p className="px-4 py-3 text-sm text-tinta-suave">Todas as categorias de despesa têm orçamento. 👏</p>}
        </div>
      </section>

      {receitas.length > 0 && (
        <section>
          <h3 className="mb-2 text-lg">Categorias de receita</h3>
          <div className="flex flex-wrap gap-2">
            {receitas.map((c) => (
              <button key={c._id} className="chip border border-linha bg-papel-claro px-3 py-1 text-sm" onClick={() => setForm(c)}>{c.icone} {c.nome}</button>
            ))}
          </div>
        </section>
      )}

      <FormCategoria aberto={form !== null} cat={form} base={base} aoFechar={() => setForm(null)}
        aoSalvar={async () => { setForm(null); await recarregar(); avisar('Categoria salva'); }}
        aoApagar={async (id) => { await del(`/categorias/${id}`); setForm(null); await recarregar(); avisar('Categoria apagada'); }} />
    </div>
  );
}

const CORES = ['#8b5e3c', '#5f7a4a', '#b5651d', '#4a6378', '#7a4a5f', '#9c7a2c', '#3f7a78', '#6b5b8a', '#a33a2c', '#2f6b4f', '#7d7468'];

function FormCategoria({ aberto, cat, base, aoFechar, aoSalvar, aoApagar }) {
  const avisar = useAviso();
  const novo = !cat?._id;
  const [f, setF] = useState({});
  useEffect(() => {
    if (!aberto) return;
    setF(cat?._id
      ? { ...cat, orcamentoMensal: cat.orcamentoMensal ? String(cat.orcamentoMensal).replace('.', ',') : '' }
      : { nome: '', tipo: 'despesa', icone: '•', cor: CORES[0], orcamentoMensal: '', moeda: base, alertaPct: 80 });
  }, [aberto, cat, base]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    if (!f.nome?.trim()) return avisar('Dê um nome', 'erro');
    const orc = f.orcamentoMensal === '' ? 0 : lerNumero(f.orcamentoMensal);
    if (!(orc >= 0)) return avisar('Orçamento inválido', 'erro');
    const corpo = { nome: f.nome, tipo: f.tipo, icone: f.icone || '•', cor: f.cor, orcamentoMensal: orc, moeda: f.moeda, alertaPct: Number(f.alertaPct) || 80 };
    try { novo ? await post('/categorias', corpo) : await put(`/categorias/${cat._id}`, corpo); aoSalvar(); }
    catch (err) { avisar(err.message, 'erro'); }
  };

  return (
    <Modal titulo={novo ? 'Nova categoria' : f.nome || 'Categoria'} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid grid-cols-[4.5rem_1fr] gap-3">
          <Campo rotulo="Ícone"><input className="campo text-center" maxLength={4} value={f.icone || ''} onChange={set('icone')} /></Campo>
          <Campo rotulo="Nome"><input className="campo" value={f.nome || ''} onChange={set('nome')} /></Campo>
        </div>
        {novo && (
          <div className="grid grid-cols-2 gap-2">
            {[['despesa', 'Despesa'], ['receita', 'Receita']].map(([k, t]) => (
              <button type="button" key={k} onClick={() => setF((x) => ({ ...x, tipo: k }))}
                className={`rounded-lg border px-2 py-2 text-sm ${f.tipo === k ? 'border-couro bg-couro text-papel-claro' : 'border-linha bg-white/60'}`}>{t}</button>
            ))}
          </div>
        )}
        <Campo rotulo="Cor">
          <div className="flex flex-wrap gap-2">
            {CORES.map((c) => (
              <button type="button" key={c} onClick={() => setF((x) => ({ ...x, cor: c }))} aria-label={c}
                className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-papel-claro ${f.cor === c ? 'ring-2 ring-tinta' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </Campo>
        {f.tipo === 'despesa' && (
          <>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Campo rotulo="Orçamento mensal" dica="Deixe vazio para não limitar."><input className="campo num" inputMode="decimal" value={f.orcamentoMensal ?? ''} onChange={set('orcamentoMensal')} placeholder="0,00" /></Campo>
              <Campo rotulo="Moeda"><select className="campo" value={f.moeda} onChange={set('moeda')}><option>EUR</option><option>BRL</option><option>USD</option></select></Campo>
            </div>
            <Campo rotulo={`Avisar ao atingir ${f.alertaPct}%`}>
              <input type="range" min="50" max="100" step="5" value={f.alertaPct || 80} onChange={set('alertaPct')} className="w-full accent-couro" />
            </Campo>
          </>
        )}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {!novo ? <BotaoConfirmar texto="Apagar? Lançamentos ficam sem categoria" aoConfirmar={() => aoApagar(cat._id)}>Apagar</BotaoConfirmar> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-secundario" onClick={aoFechar}>Cancelar</button>
            <button className="btn-primario">Salvar</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
