import { useCallback, useEffect, useState } from 'react';
import { del, get, post, put } from '../api.js';
import { dataCurta, dinheiro } from '../fmt.js';
import { useT } from '../i18n.js';
import { useDados } from '../dados.jsx';
import { BotaoConfirmar, Campo, Carregando, useAviso } from './ui.jsx';
import Icone from './Icones.jsx';

const DEMO = import.meta.env.MODE === 'demo';
const copiar = async (texto) => { try { await navigator.clipboard.writeText(texto); return true; } catch { return false; } };
const hora = (d) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(d));

/** Lançar automaticamente cada compra com Apple Pay (automação "Transação" do app Atalhos) */
export default function ApplePay() {
  const t = useT();
  const avisar = useAviso();
  const { contasAtivas } = useDados();
  const [cfg, setCfg] = useState(null);
  const [mostrarChave, setMostrarChave] = useState(false);
  const carregar = useCallback(async () => setCfg(await get('/atalho')), []);
  useEffect(() => { carregar().catch((e) => avisar(e.message, 'erro')); }, [carregar, avisar]);
  if (!cfg) return <Carregando />;

  const url = `${DEMO ? 'https://seu-app.up.railway.app' : location.origin}/api/atalho/lancamento`;
  const cabecalho = cfg.chave ? `Bearer ${cfg.chave}` : '';
  const contas = contasAtivas.filter((c) => ['corrente', 'cartao', 'dinheiro'].includes(c.tipo));
  const salvar = async (dados) => { await put('/atalho', dados); await carregar(); avisar(t('ap.salvo')); };
  const gerar = async () => { await post('/atalho/chave'); setMostrarChave(true); await carregar(); };
  const simular = async () => {
    const r = await fetch('/api/atalho/lancamento', { method: 'POST', headers: { 'content-type': 'application/json', authorization: cabecalho }, body: JSON.stringify({ Quantia: '3,20 €', Comerciante: t('ap.exemploLoja'), 'Cartão ou Passe': 'Apple Pay' }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) avisar(d.texto || t('ap.recebido')); else avisar(d.erro || t('ap.falhou'), 'erro');
    await carregar();
  };
  const Copiar = ({ texto, rotulo }) => (
    <button type="button" className="btn-secundario shrink-0 px-3 py-2 text-xs" onClick={async () => { const ok = await copiar(texto); avisar(ok ? t('ap.copiado') : t('ap.copieManual'), ok ? 'ok' : 'erro'); }}>
      {rotulo || t('ap.copiar')}
    </button>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl">{t('ap.titulo')}</h2>
        <p className="text-sm text-texto-2">{t('ap.sub')}</p>
      </div>

      {!cfg.ativo ? (
        <section className="cartao space-y-3 p-5">
          <p className="text-sm text-texto-2">{t('ap.comeco')}</p>
          <button className="btn-primario w-full" onClick={gerar}>{t('ap.ativar')}</button>
        </section>
      ) : (
        <>
          <section className="cartao space-y-4 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-pos"><Icone nome="check" className="h-4 w-4" forte />{t('ap.ativo')}</p>
            <div>
              <p className="rotulo mb-1.5">{t('ap.endereco')}</p>
              <div className="flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-xl bg-sutil px-3 py-2 text-xs">{url}</code><Copiar texto={url} /></div>
            </div>
            <div>
              <p className="rotulo mb-1.5">{t('ap.cabecalho')}</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-xl bg-sutil px-3 py-2 text-xs">{mostrarChave ? cabecalho : 'Bearer ••••••••••••'}</code>
                <button type="button" className="btn-secundario shrink-0 px-3 py-2 text-xs" onClick={() => setMostrarChave((x) => !x)}>{mostrarChave ? t('ap.ocultar') : t('ap.mostrar')}</button>
                <Copiar texto={cabecalho} />
              </div>
              <p className="mt-1.5 text-xs text-texto-3">{t('ap.chaveDica')}</p>
            </div>
            <Campo rotulo={t('ap.contaPadrao')} dica={t('ap.contaPadraoDica')}>
              <select id="ap-conta" className="campo" value={cfg.conta || ''} onChange={(e) => salvar({ conta: e.target.value || null })}>
                <option value="">{t('lanc.semConta')}</option>
                {contas.map((c) => <option key={c._id} value={c._id}>{c.nome}</option>)}
              </select>
            </Campo>
            {Object.keys(cfg.cartoes).length > 0 && contas.length > 0 && (
              <div>
                <p className="rotulo mb-1.5">{t('ap.cartoes')}</p>
                <ul className="space-y-2">
                  {Object.entries(cfg.cartoes).map(([nome, conta]) => (
                    <li key={nome} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-semibold">💳 {nome}</span>
                      <select className="campo w-44 py-2 text-sm" aria-label={nome} value={conta || ''} onChange={(e) => salvar({ cartoes: { ...cfg.cartoes, [nome]: e.target.value || null } })}>
                        <option value="">{t('ap.usarPadrao')}</option>
                        {contas.map((c) => <option key={c._id} value={c._id}>{c.nome}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="cartao p-5">
            <h3 className="mb-3 text-base">{t('ap.passos')}</h3>
            <ol className="space-y-3 text-sm">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <li key={n} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-marca-suave text-xs font-bold text-marca">{n}</span>
                  <span className="min-w-0 flex-1 text-texto-2" dangerouslySetInnerHTML={{ __html: t(`ap.passo${n}`) }} />
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-2xl bg-sutil p-4 text-xs">
              <p className="mb-2 font-bold text-texto">{t('ap.corpo')}</p>
              <table className="w-full"><tbody>
                {[['valor', t('ap.varValor')], ['comerciante', t('ap.varComerciante')], ['cartao', t('ap.varCartao')]].map(([k, v]) => (
                  <tr key={k}><td className="py-1 pr-3 font-mono font-semibold text-texto">{k}</td><td className="py-1 text-texto-2">{v}</td></tr>
                ))}
              </tbody></table>
            </div>
            <p className="mt-3 text-xs text-texto-3">{t('ap.nota')}</p>
          </section>

          <section className="cartao p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base">{t('ap.ultimos')}</h3>
              <button className="btn-secundario px-3 py-2 text-xs" onClick={simular}>{t('ap.simular')}</button>
            </div>
            {!cfg.ultimos.length ? <p className="text-sm text-texto-2">{t('ap.nadaAinda')}</p> : (
              <ul className="divide-y divide-linha text-sm">
                {cfg.ultimos.map((u, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${u.ok ? 'bg-pos-suave text-pos' : 'bg-neg-suave text-neg'}`}><Icone nome={u.ok ? 'check' : 'alerta'} className="h-3.5 w-3.5" forte /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{u.ok ? u.descricao : t('ap.erroValor')}</span>
                      <span className="block truncate text-xs text-texto-3">{dataCurta(u.quando)} {hora(u.quando)}{u.duplicado ? ` · ${t('ap.duplicado')}` : u.categoria ? ` · ${u.categoria}` : u.ok ? ` · ${t('comum.semCategoria')}` : ` · ${u.recebido || ''}`}</span>
                    </span>
                    {u.ok && <span className="num shrink-0 font-bold">{dinheiro(u.valor, u.moeda)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex flex-wrap justify-between gap-2">
            <BotaoConfirmar className="btn-secundario" texto={t('ap.novaChaveConf')} aoConfirmar={gerar}>{t('ap.novaChave')}</BotaoConfirmar>
            <BotaoConfirmar texto={t('ap.desligarConf')} aoConfirmar={async () => { await del('/atalho'); await carregar(); }}>{t('ap.desligar')}</BotaoConfirmar>
          </div>
        </>
      )}
    </div>
  );
}
