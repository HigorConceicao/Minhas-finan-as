import { useEffect, useState } from 'react';
import { get } from '../api.js';
import { dataCurta, dinheiro, mesCurto, pct } from '../fmt.js';
import { useT } from '../i18n.js';
import { Carregando, Estatistica, IconeCategoria, Segmentado, Vazio, useAviso } from './ui.jsx';
import { BarrasMensais } from './Graficos.jsx';
import Icone from './Icones.jsx';

const DEMO = import.meta.env.MODE === 'demo';

function baixarCsv(nome, linhas) {
  const txt = linhas.map((l) => l.map((c) => {
    const s = c == null ? '' : String(c);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' }));
  a.download = nome; a.click();
}
const num = (v) => String(v).replace('.', ',');

export default function Relatorio({ base, setBase }) {
  const t = useT();
  const avisar = useAviso();
  const [ano, setAno] = useState(new Date().getFullYear());
  const [r, setR] = useState(null);
  const [tipoCat, setTipoCat] = useState('despesa');
  useEffect(() => { setR(null); get(`/relatorio?ano=${ano}&base=${base}`).then(setR).catch((e) => avisar(e.message, 'erro')); }, [ano, base, avisar]);
  if (!r) return <Carregando />;

  const temDados = r.totais.entradas > 0 || r.totais.saidas > 0 || r.totais.rendimentos > 0;
  const catsDoTipo = r.categorias.filter((c) => c.tipo === tipoCat);
  const totalTipo = catsDoTipo.reduce((s, c) => s + c.total, 0);
  const mesesComDados = r.meses.filter((_, i) => r.entradas[i] || r.saidas[i]).length || 1;
  const nomeCat = (id) => r.categorias.find((c) => c.categoria === id)?.nome || t('comum.semCategoria');

  const exportar = () => baixarCsv(`relatorio-${ano}.csv`, [
    ['', ...r.meses.map(mesCurto), t('rel.total')],
    [t('rel.entradas'), ...r.entradas.map(num), num(r.totais.entradas)],
    [t('rel.saidas'), ...r.saidas.map(num), num(r.totais.saidas)],
    [t('rel.rendimentos'), ...r.rendimentos.map(num), num(r.totais.rendimentos)],
    [],
    ...r.categorias.map((c) => [`${c.tipo === 'receita' ? '+' : '−'} ${c.nome || t('comum.semCategoria')}`, ...c.meses.map(num), num(c.total)]),
  ]);
  const exportarDed = () => baixarCsv(`dedutiveis-${ano}.csv`, [
    ['Data', 'Descrição', 'Categoria', 'Valor', 'Moeda', `Valor (${r.base})`, 'Nota'],
    ...r.dedutiveis.map((d) => [String(d.data).slice(0, 10), d.descricao, nomeCat(d.categoria), num(d.valor), d.moeda, num(d.valorBase), d.nota]),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl">{t('rel.titulo')}</h2>
          <p className="text-sm text-texto-2">{t('rel.moeda', { m: r.base })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={t('rel.titulo')} className="campo w-auto py-2 font-bold" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {(r.anos.includes(ano) ? r.anos : [ano, ...r.anos]).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <Segmentado className="w-48" valor={base} aoMudar={setBase} opcoes={[['EUR', '€ EUR'], ['BRL', 'R$ BRL']]} />
        </div>
      </div>

      {!temDados ? <Vazio icone="grafico" titulo={String(ano)} texto={t('rel.semDados')} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Estatistica rotulo={t('rel.entradas')} valor={dinheiro(r.totais.entradas, r.base)} detalhe={`${t('rel.media')} ${dinheiro(r.totais.entradas / mesesComDados, r.base)}`} tom="pos" />
            <Estatistica rotulo={t('rel.saidas')} valor={dinheiro(r.totais.saidas, r.base)} detalhe={`${t('rel.media')} ${dinheiro(r.totais.saidas / mesesComDados, r.base)}`} tom="neg" />
            <Estatistica rotulo={t('rel.saldo')} valor={dinheiro(r.totais.saldo, r.base)} tom={r.totais.saldo >= 0 ? 'pos' : 'neg'} />
            <Estatistica rotulo={t('rel.rendimentos')} valor={dinheiro(r.totais.rendimentos, r.base)} detalhe={t('rel.rendimentosNota')} />
          </div>

          <section className="cartao p-5">
            <h3 className="mb-3 text-base">{t('rel.porMes')}</h3>
            <BarrasMensais meses={r.meses} moeda={r.base} aria={t('rel.porMes')} series={[
              { chave: 'e', rotulo: t('rel.entradas'), valores: r.entradas, classe: 'fill-pos', cor: 'bg-pos', texto: 'text-pos' },
              { chave: 's', rotulo: t('rel.saidas'), valores: r.saidas, classe: 'fill-neg', cor: 'bg-neg', texto: 'text-neg' },
              ...(r.totais.rendimentos > 0 ? [{ chave: 'r', rotulo: t('rel.rendimentos'), valores: r.rendimentos, classe: 'fill-marca', cor: 'bg-marca', texto: 'text-marca' }] : []),
            ]} />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead><tr className="text-left text-xs text-texto-3">
                  <th className="py-2 font-semibold" />
                  <th className="py-2 text-right font-semibold">{t('rel.entradas')}</th>
                  <th className="py-2 text-right font-semibold">{t('rel.saidas')}</th>
                  <th className="py-2 text-right font-semibold">{t('rel.saldo')}</th>
                  <th className="py-2 text-right font-semibold">{t('rel.rendimentos')}</th>
                </tr></thead>
                <tbody className="divide-y divide-linha">
                  {r.meses.map((m, i) => (
                    <tr key={m} className={!r.entradas[i] && !r.saidas[i] && !r.rendimentos[i] ? 'text-texto-3' : ''}>
                      <td className="py-2 font-semibold">{mesCurto(m)}</td>
                      <td className="num py-2 text-right">{dinheiro(r.entradas[i], r.base)}</td>
                      <td className="num py-2 text-right">{dinheiro(r.saidas[i], r.base)}</td>
                      <td className={`num py-2 text-right font-semibold ${r.saldo[i] < 0 ? 'text-neg' : ''}`}>{dinheiro(r.saldo[i], r.base)}</td>
                      <td className="num py-2 text-right text-texto-2">{dinheiro(r.rendimentos[i], r.base)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="cartao p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base">{tipoCat === 'despesa' ? t('rel.despesasCat') : t('rel.receitasCat')}</h3>
              <Segmentado className="w-56" valor={tipoCat} aoMudar={setTipoCat} opcoes={[['despesa', t('rel.saidas')], ['receita', t('rel.entradas')]]} />
            </div>
            {!catsDoTipo.length ? <p className="text-sm text-texto-2">{t('rel.semDados')}</p> : (
              <ul className="space-y-3">
                {catsDoTipo.map((c) => (
                  <li key={c.categoria || 'sem'} className="flex items-center gap-3">
                    <IconeCategoria cor={c.cor} icone={c.icone} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-semibold">{c.nome || t('comum.semCategoria')}{c.dedutivel && <span className="chip ml-2 bg-marca-suave py-0.5 text-marca">§</span>}</span>
                        <span className="num shrink-0 font-bold">{dinheiro(c.total, r.base)}</span>
                      </div>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-sutil"><span className="block h-full rounded-full" style={{ width: `${Math.max(2, (c.total / Math.max(totalTipo, 1)) * 100)}%`, background: c.cor }} /></span>
                      <p className="num mt-1 flex justify-between text-xs text-texto-3"><span>{pct((c.total / Math.max(totalTipo, 1)) * 100, 0)}</span><span>{t('rel.media')} {dinheiro(c.total / mesesComDados, r.base)}</span></p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cartao p-5">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base">{t('rel.dedutiveis')}</h3>
              {r.dedutiveis.length > 0 && <span className="num text-lg font-extrabold">{dinheiro(r.totais.dedutiveis, r.base)}</span>}
            </div>
            <p className="mb-3 text-xs text-texto-3">{t('rel.dedutiveisDica')}</p>
            {!r.dedutiveis.length ? <p className="text-sm text-texto-2">{t('rel.semDedutiveis')}</p> : (
              <ul className="divide-y divide-linha">
                {r.dedutiveis.map((d) => (
                  <li key={d._id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-16 shrink-0 text-xs text-texto-3">{dataCurta(d.data)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{d.descricao}</span><span className="block truncate text-xs text-texto-3">{nomeCat(d.categoria)}</span></span>
                    <span className="num shrink-0 text-right">{dinheiro(d.valor, d.moeda)}{d.moeda !== r.base && <span className="block text-xs text-texto-3">{dinheiro(d.valorBase, r.base)}</span>}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!DEMO && (
            <div className="flex flex-wrap gap-2">
              <button className="btn-secundario" onClick={exportar}><Icone nome="download" className="h-4 w-4" />{t('rel.exportar')}</button>
              {r.dedutiveis.length > 0 && <button className="btn-secundario" onClick={exportarDed}><Icone nome="download" className="h-4 w-4" />{t('rel.exportarDed')}</button>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
