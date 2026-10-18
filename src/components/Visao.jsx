import { dinheiro, mesLongo, pct } from '../fmt.js';
import { Barra, Carregando, Estatistica, SeletorMes } from './ui.jsx';

export default function Visao({ mes, setMes, base, setBase, resumo, irPara, novoLancamento }) {
  if (!resumo) return <Carregando />;
  const atencao = resumo.orcamentos.filter((o) => o.estado === 'estourado' || o.estado === 'alerta');
  const topGastos = [...resumo.orcamentos].filter((o) => o.gasto > 0).sort((a, b) => b.gasto - a.gasto).slice(0, 5);
  const maxGasto = topGastos[0]?.gasto || 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorMes mes={mes} aoMudar={setMes} />
        <div className="flex items-center gap-2">
          <select className="campo w-auto py-1.5 text-sm" value={base} onChange={(e) => setBase(e.target.value)} aria-label="Moeda de exibição">
            <option>EUR</option><option>BRL</option><option>USD</option>
          </select>
          <button className="btn-primario" onClick={novoLancamento}>+ Lançamento</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Estatistica rotulo="Receitas" valor={dinheiro(resumo.receitas, base)} tom="pos" />
        <Estatistica rotulo="Despesas" valor={dinheiro(resumo.despesas, base)} tom="neg" />
        <Estatistica rotulo="Saldo do mês" valor={dinheiro(resumo.saldo, base)} tom={resumo.saldo >= 0 ? 'pos' : 'neg'}
          detalhe={resumo.receitas > 0 ? `${pct((resumo.saldo / resumo.receitas) * 100, 0)} das receitas` : undefined} />
        <Estatistica rotulo="Contas de rendimento" valor={dinheiro(resumo.patrimonioContas, base)} detalhe={`${resumo.contas.length} conta(s)`} />
      </div>

      {atencao.length > 0 && (
        <section className="folha border-ambar/50 p-4">
          <p className="mb-2 font-titulo text-lg">⚠️ Atenção no orçamento</p>
          <ul className="space-y-1 text-sm">
            {atencao.map((o) => (
              <li key={o.categoria} className="flex justify-between gap-2">
                <span>{o.icone} {o.nome}</span>
                <span className={`num ${o.estado === 'estourado' ? 'text-vermelho' : 'text-ambar'}`}>{pct(o.pct, 0)} · {dinheiro(o.gasto, base)} / {dinheiro(o.limite, base)}</span>
              </li>
            ))}
          </ul>
          <button className="mt-2 text-sm text-couro" onClick={() => irPara('orcamento')}>Ver orçamento →</button>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="folha p-4">
          <h3 className="mb-3 text-lg">Para onde foi o dinheiro</h3>
          {!topGastos.length ? <p className="text-sm text-tinta-suave">Nenhuma despesa em {mesLongo(mes)}.</p> : (
            <ul className="space-y-3">
              {topGastos.map((o) => (
                <li key={o.categoria}>
                  <div className="mb-1 flex justify-between text-sm"><span>{o.icone} {o.nome}</span><span className="num">{dinheiro(o.gasto, base)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-papel-escuro"><div className="h-full rounded-full" style={{ width: `${(o.gasto / maxGasto) * 100}%`, background: o.cor }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="folha p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg">Contas de rendimento</h3>
            <button className="text-sm text-couro" onClick={() => irPara('rendimento')}>Abrir →</button>
          </div>
          {!resumo.contas.length ? (
            <button className="w-full rounded-lg border border-dashed border-linha p-4 text-sm text-tinta-suave hover:bg-papel-escuro/40" onClick={() => irPara('rendimento')}>
              + Cadastrar a conta que rende todo mês
            </button>
          ) : (
            <ul className="space-y-3">
              {resumo.contas.map((c) => (
                <li key={c._id} className="rounded-lg border border-linha/80 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{c.nome}</span>
                    <span className="num text-lg">{dinheiro(c.saldo, c.moeda)}</span>
                  </div>
                  <div className="num mt-1 flex justify-between text-xs">
                    <span className="text-verde">juros do mês {dinheiro(c.jurosMes, c.moeda)}</span>
                    <span className="text-vermelho">saídas {dinheiro(c.saidasMes, c.moeda)}</span>
                  </div>
                  {c.moeda !== base && <p className="num mt-1 text-xs text-tinta-fraca">≈ {dinheiro(c.saldoBase, base)}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {resumo.totalOrcado > 0 && (
        <section className="folha p-4">
          <div className="mb-2 flex justify-between text-sm"><span className="font-medium">Orçamento total</span><span className="num">{dinheiro(resumo.gastoOrcado, base)} / {dinheiro(resumo.totalOrcado, base)}</span></div>
          <Barra valor={resumo.gastoOrcado} maximo={resumo.totalOrcado} estado={resumo.gastoOrcado > resumo.totalOrcado ? 'estourado' : 'ok'} />
        </section>
      )}

      <p className="text-center text-xs text-tinta-fraca">
        Valores convertidos para {base} · câmbio {resumo.cambio.fonte === 'BCE' ? `BCE de ${resumo.cambio.data}` : 'aproximado (sem conexão com a cotação)'}
      </p>
    </div>
  );
}
