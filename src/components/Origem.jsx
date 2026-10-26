import { useEffect, useState } from 'react';
import { get } from '../api.js';
import { dinheiro, lerNumero } from '../fmt.js';
import { useT } from '../i18n.js';
import { useDados } from '../dados.jsx';
import { Campo } from './ui.jsx';

// contas com dinheiro de verdade: de onde sai (ou para onde volta) o dinheiro separado
export const TIPOS_ORIGEM = ['corrente', 'dinheiro', 'investimento'];
const lerUltima = () => { try { return localStorage.getItem('mf2-origem') || ''; } catch { return ''; } };
export const lembrarOrigem = (id) => { try { if (id) localStorage.setItem('mf2-origem', id); } catch {} };

let taxasCache = null;
const usarTaxas = () => {
  const [taxas, setTaxas] = useState(taxasCache);
  useEffect(() => { if (!taxasCache) get('/cambio').then((r) => { taxasCache = r.taxas; setTaxas(r.taxas); }).catch(() => {}); }, []);
  return taxas;
};

/** Conta sugerida ao abrir o formulário: a última usada, se ainda existir */
export function origemInicial(contas, obrigatoria) {
  const validas = contas.filter((c) => TIPOS_ORIGEM.includes(c.tipo) && !c.arquivada);
  const ultima = lerUltima();
  if (validas.some((c) => c._id === ultima)) return ultima;
  return obrigatoria ? validas[0]?._id || '' : '';
}

/**
 * Escolha da conta de onde sai o dinheiro (ou para onde volta), com o saldo que fica depois.
 * `valor` é o valor digitado na moeda do destino (meta ou viagem); `volta` = dinheiro voltando para a conta.
 */
export default function SeletorOrigem({ conta, aoMudar, valor, moeda, valorConta, aoMudarValorConta, volta = false, obrigatoria = false, dica }) {
  const t = useT();
  const { contasAtivas } = useDados();
  const taxas = usarTaxas();
  const opcoes = contasAtivas.filter((c) => TIPOS_ORIGEM.includes(c.tipo));
  const c = opcoes.find((x) => x._id === conta);
  const outraMoeda = c && c.moeda !== moeda;
  const v = lerNumero(valor) || 0;
  const vc = lerNumero(valorConta);
  const naConta = !c ? 0 : !outraMoeda ? v : vc > 0 ? vc : taxas ? (v / taxas[moeda]) * taxas[c.moeda] : null;
  const depois = c && naConta != null ? c.saldo + (volta ? naConta : -naConta) : null;

  if (!opcoes.length) return <p className="rounded-2xl bg-sutil p-3 text-xs text-texto-2">{t('orig.semContas')}</p>;
  return (
    <div className="space-y-3 rounded-2xl bg-sutil p-4">
      <Campo rotulo={volta ? t('orig.paraOnde') : t('orig.deOnde')} dica={dica}>
        <select id="origem-conta" className="campo bg-cartao" value={conta || ''} onChange={(e) => { aoMudar(e.target.value); aoMudarValorConta?.(''); }}>
          {!obrigatoria && <option value="">{volta ? t('orig.nenhumaVolta') : t('orig.nenhuma')}</option>}
          {obrigatoria && !conta && <option value="">—</option>}
          {opcoes.map((o) => <option key={o._id} value={o._id}>{o.nome} · {dinheiro(o.saldo, o.moeda)}</option>)}
        </select>
      </Campo>
      {outraMoeda && (
        <Campo rotulo={volta ? t('orig.voltaNaConta', { m: c.moeda }) : t('orig.saiDaConta', { m: c.moeda })}>
          <input id="origem-valor-conta" className="campo num bg-cartao" inputMode="decimal" value={valorConta ?? ''} onChange={(e) => aoMudarValorConta(e.target.value)}
            placeholder={naConta != null && v ? `≈ ${dinheiro(naConta, c.moeda)} (${t('lanc.cambioDoDia')})` : t('lanc.cambioDoDia')} />
        </Campo>
      )}
      {c && v > 0 && depois != null && (
        <p className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-texto-2">{t('orig.depois', { n: c.nome })}</span>
          <span className={`num font-bold ${depois < 0 ? 'text-neg' : ''}`}>{dinheiro(depois, c.moeda)}</span>
        </p>
      )}
      {c && depois != null && depois < 0 && <p className="text-xs font-semibold text-neg">{t('orig.negativa')}</p>}
    </div>
  );
}
