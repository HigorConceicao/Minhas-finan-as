import { useEffect, useState } from 'react';
import { del, post, put } from '../api.js';
import { dinheiro, lerNumero, paraCampo, pct } from '../fmt.js';
import { useT } from '../i18n.js';
import { Barra, BotaoConfirmar, Campo, Carregando, IconeCategoria, Modal, Segmentado, SeletorMes, useAviso } from './ui.jsx';
import Icone from './Icones.jsx';

const ESTADO = { ok: 'bg-marca-suave text-marca', alerta: 'bg-aviso-suave text-aviso', estourado: 'bg-neg-suave text-neg' };

export default function Orcamento({ mes, setMes, base, resumo, categorias, recarregar }) {
  const t = useT();
  const avisar = useAviso();
  const [form, setForm] = useState(null);
  if (!resumo) return <Carregando />;

  const comLimite = resumo.orcamentos.filter((o) => o.limite);
  const semLimite = resumo.orcamentos.filter((o) => !o.limite);
  const restante = resumo.totalOrcado - resumo.gastoOrcado;
  const receitas = categorias.filter((c) => c.tipo === 'receita');
  const abrir = (id) => setForm(categorias.find((c) => c._id === id) || {});
  const usoTotal = resumo.totalOrcado ? resumo.gastoOrcado / resumo.totalOrcado : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorMes mes={mes} aoMudar={setMes} />
        <button className="btn-secundario" onClick={() => setForm({})}><Icone nome="mais" className="h-4 w-4" forte />{t('orc.categoria').replace('+ ', '')}</button>
      </div>

      <section className="cartao p-5">
        <p className="rotulo">{t('orc.doMes')}</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
          <p className="num text-3xl font-extrabold tracking-tight">{dinheiro(resumo.gastoOrcado, base)} <span className="text-base font-semibold text-texto-3">{t('orc.de')} {dinheiro(resumo.totalOrcado, base)}</span></p>
          <p className={`num text-sm font-bold ${restante >= 0 ? 'text-pos' : 'text-neg'}`}>
            {restante >= 0 ? t('orc.restam', { v: dinheiro(restante, base) }) : t('orc.excedido', { v: dinheiro(-restante, base) })}
          </p>
        </div>
        <div className="mt-4">
          <Barra valor={resumo.gastoOrcado} maximo={resumo.totalOrcado || 1} estado={usoTotal > 1 ? 'estourado' : usoTotal > 0.8 ? 'alerta' : 'ok'} />
        </div>
        {resumo.fracaoDoMes > 0 && resumo.fracaoDoMes < 1 && (
          <p className="mt-3 text-xs text-texto-3">{t('orc.mesPassou', { p: pct(resumo.fracaoDoMes * 100, 0) })}</p>
        )}
      </section>

      {comLimite.length > 0 && (
        <ul className="cartao divide-y divide-linha overflow-hidden">
          {comLimite.map((o) => (
            <li key={o.categoria}>
              <button className="flex w-full items-start gap-3 px-4 py-4 text-left hover:bg-sutil/60" onClick={() => abrir(o.categoria)}>
                <IconeCategoria cor={o.cor} icone={o.icone} />
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">{o.nome}</span>
                    <span className={`chip ${ESTADO[o.estado]}`}>{t(`orc.estado.${o.estado}`)}</span>
                  </div>
                  <Barra valor={o.gasto} maximo={o.limite} estado={o.estado} ritmo={o.ritmo} />
                  <div className="num mt-2 flex justify-between gap-2 text-xs text-texto-2">
                    <span>{dinheiro(o.gasto, base)} {t('orc.de')} {dinheiro(o.limite, base)}</span>
                    <span className={o.restante < 0 ? 'font-semibold text-neg' : ''}>{o.restante < 0 ? `+${dinheiro(-o.restante, base)}` : t('orc.resta', { v: dinheiro(o.restante, base) })}</span>
                  </div>
                  {o.ritmo != null && o.ritmo > o.limite && o.estado !== 'estourado' && resumo.fracaoDoMes < 1 && (
                    <p className="mt-1 text-xs font-semibold text-aviso">{t('orc.ritmo', { v: dinheiro(o.ritmo, base) })}</p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <section>
        <h3 className="mb-2 px-1 text-base">{t('orc.semOrcamento')}</h3>
        <ul className="cartao divide-y divide-linha overflow-hidden">
          {semLimite.map((o) => (
            <li key={o.categoria}>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-sutil/60" onClick={() => abrir(o.categoria)}>
                <IconeCategoria cor={o.cor} icone={o.icone} tamanho="h-8 w-8 text-sm" />
                <span className="flex-1 font-semibold">{o.nome}</span>
                <span className="num text-texto-2">{dinheiro(o.gasto, base)}</span>
                <span className="text-xs font-semibold text-marca">{t('orc.definir')}</span>
              </button>
            </li>
          ))}
          {resumo.semCategoria > 0 && (
            <li className="flex items-center gap-3 px-4 py-3 text-sm text-texto-2"><IconeCategoria tamanho="h-8 w-8 text-sm" /><span className="flex-1">{t('comum.semCategoria')}</span><span className="num">{dinheiro(resumo.semCategoria, base)}</span></li>
          )}
          {!semLimite.length && !resumo.semCategoria && <li className="px-4 py-3 text-sm text-texto-2">{t('orc.todasComOrcamento')}</li>}
        </ul>
      </section>

      {receitas.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-base">{t('orc.catReceita')}</h3>
          <div className="flex flex-wrap gap-2">
            {receitas.map((c) => (
              <button key={c._id} className="chip bg-cartao px-3 py-2 text-sm shadow-cartao" onClick={() => setForm(c)}>{c.icone} {c.nome}</button>
            ))}
          </div>
        </section>
      )}

      <FormCategoria aberto={form !== null} cat={form} base={base} aoFechar={() => setForm(null)}
        aoSalvar={async () => { setForm(null); await recarregar(); avisar(t('orc.salva')); }}
        aoApagar={async (id) => { await del(`/categorias/${id}`); setForm(null); await recarregar(); avisar(t('orc.apagada')); }} />
    </div>
  );
}

const CORES = ['#2952eb', '#0d8c54', '#e0672b', '#8b5cf6', '#d63030', '#0ea5a4', '#c47a0a', '#db2777', '#475569', '#65a30d', '#8a92a3'];

function FormCategoria({ aberto, cat, base, aoFechar, aoSalvar, aoApagar }) {
  const t = useT();
  const avisar = useAviso();
  const novo = !cat?._id;
  const [f, setF] = useState({});
  useEffect(() => {
    if (!aberto) return;
    setF(cat?._id
      ? { ...cat, orcamentoMensal: cat.orcamentoMensal ? paraCampo(cat.orcamentoMensal) : '' }
      : { nome: '', tipo: 'despesa', icone: '•', cor: CORES[0], orcamentoMensal: '', moeda: base, alertaPct: 80 });
  }, [aberto, cat, base]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    if (!f.nome?.trim()) return avisar(t('orc.deNome'), 'erro');
    const orc = f.orcamentoMensal === '' ? 0 : lerNumero(f.orcamentoMensal);
    if (!(orc >= 0)) return avisar(t('orc.invalido'), 'erro');
    const corpo = { nome: f.nome, tipo: f.tipo, icone: f.icone || '•', cor: f.cor, orcamentoMensal: orc, moeda: f.moeda, alertaPct: Number(f.alertaPct) || 80 };
    try { novo ? await post('/categorias', corpo) : await put(`/categorias/${cat._id}`, corpo); aoSalvar(); }
    catch (err) { avisar(err.message, 'erro'); }
  };

  return (
    <Modal titulo={novo ? t('orc.novaCategoria') : f.nome || t('comum.categoria')} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid grid-cols-[4.5rem_1fr] gap-3">
          <Campo rotulo={t('orc.icone')}><input id="cat-icone" className="campo text-center" maxLength={4} value={f.icone || ''} onChange={set('icone')} /></Campo>
          <Campo rotulo={t('orc.nome')}><input id="cat-nome" className="campo" value={f.nome || ''} onChange={set('nome')} /></Campo>
        </div>
        {novo && <Segmentado opcoes={[['despesa', t('comum.despesa')], ['receita', t('comum.receita')]]} valor={f.tipo} aoMudar={(k) => setF((x) => ({ ...x, tipo: k }))} />}
        <Campo rotulo={t('orc.cor')}>
          <div className="flex flex-wrap gap-2">
            {CORES.map((c) => (
              <button type="button" key={c} onClick={() => setF((x) => ({ ...x, cor: c }))} aria-label={c} aria-pressed={f.cor === c}
                className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-cartao ${f.cor === c ? 'ring-2 ring-texto' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </Campo>
        {f.tipo === 'despesa' && (
          <>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Campo rotulo={t('orc.orcamentoMensal')} dica={t('orc.semLimite')}><input id="cat-orc" className="campo num" inputMode="decimal" value={f.orcamentoMensal ?? ''} onChange={set('orcamentoMensal')} placeholder={t('comum.zero')} /></Campo>
              <Campo rotulo={t('comum.moeda')}><select id="cat-moeda" className="campo" value={f.moeda} onChange={set('moeda')}><option>EUR</option><option>BRL</option><option>USD</option></select></Campo>
            </div>
            <Campo rotulo={t('orc.avisarEm', { p: f.alertaPct })}>
              <input id="cat-alerta" type="range" min="50" max="100" step="5" value={f.alertaPct || 80} onChange={set('alertaPct')} className="w-full accent-[rgb(var(--marca))]" />
            </Campo>
          </>
        )}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {!novo ? <BotaoConfirmar texto={t('orc.apagarCat')} aoConfirmar={() => aoApagar(cat._id)}>{t('comum.apagar')}</BotaoConfirmar> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
            <button className="btn-primario">{t('comum.salvar')}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
