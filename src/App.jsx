import { useCallback, useEffect, useState } from 'react';
import { get, post, put } from './api.js';
import Acesso, { linkDeAcesso } from './components/Acesso.jsx';
import { ModalSenha, ModalUsuarios } from './components/Usuarios.jsx';
import { mesAtual } from './fmt.js';
import { IDIOMAS, ProvedorIdioma, useIdioma, useT } from './i18n.js';
import { Carregando, Modal, ProvedorAvisos, Segmentado, useAviso } from './components/ui.jsx';
import Icone from './components/Icones.jsx';
import Visao from './components/Visao.jsx';
import Lancamentos from './components/Lancamentos.jsx';
import Orcamento from './components/Orcamento.jsx';
import Recorrentes from './components/Recorrentes.jsx';
import Rendimento from './components/Rendimento.jsx';
import Metas from './components/Metas.jsx';
import Contas from './components/Contas.jsx';
import Viagens from './components/Viagens.jsx';
import Relatorio from './components/Relatorio.jsx';
import Mais from './components/Mais.jsx';
import ApplePay from './components/ApplePay.jsx';
import { ProvedorDados, useDados } from './dados.jsx';

const DEMO = import.meta.env.MODE === 'demo';
const ABAS = [
  { id: 'visao', icone: 'inicio' },
  { id: 'lancamentos', icone: 'lista' },
  { id: 'orcamento', icone: 'orcamento' },
  { id: 'contas', icone: 'carteira' },
  { id: 'metas', icone: 'meta' },
  { id: 'mais', icone: 'grade' },
];
// telas que ficam "dentro" de uma aba (a aba-mãe fica destacada e aparece o botão de voltar)
const SUB = { rendimento: 'contas', recorrentes: 'mais', viagens: 'mais', relatorio: 'mais', applepay: 'mais' };
const ROTAS = new Set([...ABAS.map((a) => a.id), ...Object.keys(SUB)]);

const lerPref = (k, padrao) => { try { return localStorage.getItem(k) || padrao; } catch { return padrao; } };
const gravarPref = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

/** Tema: 'sistema' segue o aparelho; 'claro'/'escuro' fixam */
function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === 'claro') raiz.setAttribute('data-theme', 'light');
  else if (tema === 'escuro') raiz.setAttribute('data-theme', 'dark');
  else if (!DEMO) raiz.removeAttribute('data-theme'); // na demo, o visualizador pode controlar o tema
}

export default function App({ antes = null }) {
  return (
    <ProvedorIdioma>
      {antes}
      <ProvedorAvisos><Porteiro /></ProvedorAvisos>
    </ProvedorIdioma>
  );
}

/** Dados guardados no aparelho que são de quem estava logado (some ao sair) */
function limparDadosLocais() {
  try {
    for (const k of Object.keys(localStorage)) if (/^mf2-(dia-mes|conta|origem|pessoa|moeda|lemb|base)/.test(k)) localStorage.removeItem(k);
  } catch {}
}

function Porteiro() {
  const [status, setStatus] = useState(null);
  const [eu, setEu] = useState(null);
  const [erro, setErro] = useState(false);
  useEffect(() => { aplicarTema(lerPref('mf2-tema', 'sistema')); }, []);
  const verificar = useCallback(() => {
    setErro(false);
    get('/status').then((s) => { setStatus(s); setEu(linkDeAcesso() ? null : s.eu); }).catch(() => setErro(true));
  }, []);
  useEffect(() => {
    verificar();
    const sair = () => setEu(null);
    window.addEventListener('mf2-sair', sair);
    return () => window.removeEventListener('mf2-sair', sair);
  }, [verificar]);
  const entrar = (u) => {
    if (eu && String(eu._id) !== String(u._id)) limparDadosLocais();
    try { if (localStorage.getItem('mf2-ultimo-usuario') !== String(u._id)) limparDadosLocais(); localStorage.setItem('mf2-ultimo-usuario', String(u._id)); } catch {}
    setEu(u); setStatus((s) => ({ ...s, temUsuarios: true }));
    if (!/^#[a-z]+$/.test(location.hash)) history.replaceState(null, '', '#visao');
  };
  const sair = async () => { try { await post('/auth/sair'); } catch {} limparDadosLocais(); setEu(null); };
  if (erro) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-semibold">Sem conexão com o servidor.</p>
      <button className="btn-primario" onClick={verificar}>Tentar de novo</button>
    </div>
  );
  if (!status) return <Carregando />;
  if (!eu) return <Acesso status={status} aoEntrar={entrar} />;
  // key: trocar de conta recarrega tudo do zero
  return <ProvedorDados key={eu._id}><Painel eu={eu} setEu={setEu} aoSair={sair} /></ProvedorDados>;
}

function Ajustes({ aberto, aoFechar, eu, setEu, aoSair }) {
  const t = useT();
  const avisar = useAviso();
  const { idioma, setIdioma } = useIdioma();
  const [tema, setTema] = useState(() => lerPref('mf2-tema', 'sistema'));
  const mudarTema = (v) => { setTema(v); gravarPref('mf2-tema', v); aplicarTema(v); };
  const { diaInicioMes, salvarDiaInicio } = useDados();
  const [zerar, setZerar] = useState(false);
  const [senha, setSenha] = useState(false);
  const [usuarios, setUsuarios] = useState(false);
  const [nome, setNome] = useState(eu.nome);
  useEffect(() => { if (aberto) setNome(eu.nome); }, [aberto, eu.nome]);
  const salvarNome = async () => {
    if (!nome.trim() || nome.trim() === eu.nome) return;
    try { setEu(await put('/auth/eu', { nome })); avisar(t('conta.nomeSalvo')); } catch (e) { avisar(e.message, 'erro'); }
  };

  const exportar = async () => {
    try {
      const r = await fetch('/api/exportar', { credentials: 'same-origin' });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `minhas-financas-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      return true;
    } catch { avisar(t('app.backupErro'), 'erro'); return false; }
  };

  return (
    <Modal titulo={t('ajustes.titulo')} aberto={aberto} aoFechar={aoFechar}>
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl bg-sutil p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-marca text-lg font-bold text-sobre-marca">{(eu.nome || '?').slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <input aria-label={t('acesso.nome')} className="w-full truncate rounded-lg bg-transparent px-1 font-bold outline-none focus:bg-cartao" value={nome} onChange={(e) => setNome(e.target.value)} onBlur={salvarNome} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
            <p className="truncate px-1 text-xs text-texto-3">{eu.email}</p>
          </div>
        </div>
        <div>
          <p className="rotulo mb-2">{t('ajustes.idioma')}</p>
          <Segmentado valor={idioma} aoMudar={setIdioma} opcoes={IDIOMAS.map((i) => [i.id, i.nome])} />
        </div>
        <div>
          <p className="rotulo mb-2">{t('ajustes.tema')}</p>
          <Segmentado valor={tema} aoMudar={mudarTema} opcoes={[['sistema', t('ajustes.sistema')], ['claro', t('ajustes.claro')], ['escuro', t('ajustes.escuro')]]} />
        </div>
        <div>
          <label htmlFor="aj-dia" className="rotulo mb-2 block">{t('ajustes.diaInicio')}</label>
          <select id="aj-dia" className="campo" value={diaInicioMes} onChange={async (e) => { try { await salvarDiaInicio(Number(e.target.value)); avisar(t('ajustes.diaSalvo')); } catch (err) { avisar(err.message, 'erro'); } }}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d === 1 ? t('ajustes.dia1') : t('ajustes.diaN', { d })}</option>)}
          </select>
          <p className="mt-1.5 text-xs text-texto-3">{t('ajustes.diaDica')}</p>
        </div>
        {!DEMO && (
          <div className="space-y-2 border-t border-linha pt-5">
            <button className="flex w-full items-center gap-3 rounded-2xl bg-sutil p-4 text-left text-sm font-semibold hover:bg-linha" onClick={exportar}>
              <Icone nome="download" /> <span className="flex-1">{t('app.backupDica')}</span>
            </button>
            <button className="flex w-full items-center gap-3 rounded-2xl bg-sutil p-4 text-left text-sm font-semibold hover:bg-linha" onClick={() => setSenha(true)}>
              <Icone nome="ajustes" /> <span className="flex-1">{t('conta.trocarSenha')}</span>
            </button>
            {eu.admin && (
              <button className="flex w-full items-center gap-3 rounded-2xl bg-sutil p-4 text-left text-sm font-semibold hover:bg-linha" onClick={() => setUsuarios(true)}>
                <Icone nome="grade" /> <span className="flex-1">{t('conta.usuarios')}</span>
              </button>
            )}
            <button className="flex w-full items-center gap-3 rounded-2xl p-4 text-left text-sm font-semibold text-neg hover:bg-neg-suave" onClick={() => setZerar(true)}>
              <Icone nome="lixo" /> <span className="flex-1">{t('zerar.botao')}</span>
            </button>
            {(
              <button className="flex w-full items-center gap-3 rounded-2xl p-4 text-left text-sm font-semibold text-neg hover:bg-neg-suave" onClick={aoSair}>
                <Icone nome="sair" /> <span className="flex-1">{t('ajustes.sair')}</span>
              </button>
            )}
          </div>
        )}
      </div>
      <ModalZerar aberto={zerar} aoFechar={() => setZerar(false)} exportar={exportar} />
      <ModalSenha aberto={senha} aoFechar={() => setSenha(false)} />
      {eu.admin && <ModalUsuarios aberto={usuarios} aoFechar={() => setUsuarios(false)} eu={eu} />}
    </Modal>
  );
}

/** Zerar os dados para recomeçar: backup primeiro, depois confirmação escrita */
function ModalZerar({ aberto, aoFechar, exportar }) {
  const t = useT();
  const avisar = useAviso();
  const [etapa, setEtapa] = useState(1);
  const [texto, setTexto] = useState('');
  const [manter, setManter] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (aberto) { setEtapa(1); setTexto(''); setManter(true); } }, [aberto]);
  const confirmar = async () => {
    setOcupado(true);
    try {
      await post('/resetar', { confirmacao: texto, manterCategorias: manter });
      avisar(t('zerar.feito'));
      setTimeout(() => { location.hash = 'visao'; location.reload(); }, 800);
    } catch (e) { avisar(e.message, 'erro'); setOcupado(false); }
  };
  return (
    <Modal titulo={t('zerar.titulo')} aberto={aberto} aoFechar={aoFechar}>
      <div className="space-y-4 text-sm">
        <p className="text-texto-2">{t('zerar.apaga')}</p>
        <p className="text-texto-2">{t('zerar.mantem')}</p>
        <label htmlFor="zerar-cat" className="flex cursor-pointer items-start gap-3 rounded-2xl bg-sutil p-4">
          <input id="zerar-cat" type="checkbox" checked={manter} onChange={(e) => setManter(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--marca))]" />
          <span><span className="block font-semibold">{t('zerar.manterCat')}</span><span className="block text-xs text-texto-3">{t('zerar.manterCatDica')}</span></span>
        </label>
        {etapa === 1 ? (
          <div className="space-y-2">
            <button className="btn-primario w-full" onClick={async () => { if (await exportar()) setEtapa(2); }}><Icone nome="download" className="h-4 w-4" />{t('zerar.backup')}</button>
            <button className="w-full text-center text-xs font-semibold text-texto-3 underline" onClick={() => setEtapa(2)}>{t('zerar.semBackup')}</button>
          </div>
        ) : (
          <div className="space-y-3">
            <label htmlFor="zerar-texto" className="block font-semibold">{t('zerar.digite')}</label>
            <input id="zerar-texto" className="campo font-bold tracking-widest" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="ZERAR" autoComplete="off" autoCapitalize="characters" />
            <button className="btn w-full bg-neg text-cartao hover:opacity-90 disabled:opacity-40" disabled={texto.trim().toUpperCase() !== 'ZERAR' || ocupado} onClick={confirmar}>{t('zerar.confirmar')}</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Painel({ eu, setEu, aoSair }) {
  const t = useT();
  const avisar = useAviso();
  const { idioma } = useIdioma();
  const hashValido = () => { const h = location.hash.slice(1); return ROTAS.has(h) ? h : 'visao'; };
  const [aba, setAbaEstado] = useState(hashValido);
  const { diaInicioMes, mesAtualFin } = useDados();
  const [mes, setMes] = useState(mesAtualFin);
  // ao mudar o dia de início do mês, volta para o mês financeiro atual
  useEffect(() => { setMes(mesAtualFin()); }, [diaInicioMes]); // eslint-disable-line react-hooks/exhaustive-deps
  const [base, setBaseEstado] = useState(() => lerPref('mf2-base', 'EUR'));
  const [categorias, setCategorias] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [novoSinal, setNovoSinal] = useState(0);
  const [ajustes, setAjustes] = useState(false);

  useEffect(() => {
    const aoMudarHash = () => setAbaEstado(hashValido());
    window.addEventListener('hashchange', aoMudarHash);
    return () => window.removeEventListener('hashchange', aoMudarHash);
  }, []);
  const setAba = (id) => { setAbaEstado(id); history.replaceState(null, '', `#${id}`); window.scrollTo({ top: 0 }); };
  const setBase = (b) => { setBaseEstado(b); gravarPref('mf2-base', b); };

  const carregarCategorias = useCallback(async () => setCategorias(await get('/categorias')), []);
  const carregarResumo = useCallback(async () => setResumo(await get(`/resumo?mes=${mes}&base=${base}`)), [mes, base]);
  const recarregarTudo = useCallback(async () => { await Promise.all([carregarCategorias(), carregarResumo()]); }, [carregarCategorias, carregarResumo]);

  useEffect(() => { carregarCategorias().catch((e) => avisar(e.message, 'erro')); }, [carregarCategorias, avisar]);
  useEffect(() => {
    if (aba === 'visao' || aba === 'orcamento') { setResumo(null); carregarResumo().catch((e) => avisar(e.message, 'erro')); }
  }, [aba, carregarResumo, avisar]);

  const abaMae = SUB[aba] || aba;
  const novoLancamento = () => { setAba('lancamentos'); setNovoSinal(1); };
  const consumirNovo = useCallback(() => setNovoSinal(0), []);

  return (
    <div className="mx-auto min-h-screen max-w-5xl pb-28 sm:pb-12">
      <header className="sticky z-30 bg-fundo/85 backdrop-blur-xl" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <h1 className="flex items-center gap-2.5 text-lg">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-marca text-sobre-marca"><Icone nome="rendimento" className="h-5 w-5" forte /></span>
            {t('app.nome')}
            {DEMO && <span className="chip bg-aviso-suave text-aviso">{t('app.demo')}</span>}
          </h1>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-cartao text-texto-2 shadow-cartao hover:text-texto" onClick={() => setAjustes(true)} aria-label={t('ajustes.titulo')}>
            <Icone nome="ajustes" />
          </button>
        </div>
        <nav className="hidden gap-1 px-5 pb-3 sm:flex">
          {ABAS.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)} aria-current={abaMae === a.id ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${abaMae === a.id ? 'bg-texto text-cartao' : 'text-texto-2 hover:bg-cartao hover:text-texto'}`}>
              <Icone nome={a.icone} className="h-4 w-4" />{t(`abas.${a.id}`)}
            </button>
          ))}
        </nav>
      </header>

      {/* key={idioma}: ao trocar o idioma, as telas remontam com datas e moedas no novo formato */}
      <main className="px-4 py-4 sm:px-6" key={idioma}>
        {aba === 'visao' && <Visao mes={mes} setMes={setMes} base={base} setBase={setBase} resumo={resumo} irPara={setAba} novoLancamento={novoLancamento} categorias={categorias} aoMudar={carregarResumo} />}
        {aba === 'lancamentos' && <Lancamentos mes={mes} setMes={setMes} categorias={categorias} novoSinal={novoSinal} aoConsumirNovo={consumirNovo} />}
        {aba === 'orcamento' && <Orcamento mes={mes} setMes={setMes} base={base} resumo={resumo} categorias={categorias} recarregar={recarregarTudo} />}
        {SUB[aba] && (
          <button className="mb-3 -ml-1 flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-marca hover:bg-marca-suave" onClick={() => setAba(SUB[aba])}>
            <Icone nome="esquerda" className="h-4 w-4" forte />{t(`abas.${SUB[aba]}`)}
          </button>
        )}
        {aba === 'contas' && <Contas base={base} categorias={categorias} irPara={setAba} />}
        {aba === 'rendimento' && <Rendimento />}
        {aba === 'metas' && <Metas />}
        {aba === 'mais' && <Mais irPara={setAba} abrirAjustes={() => setAjustes(true)} />}
        {aba === 'recorrentes' && <Recorrentes categorias={categorias} />}
        {aba === 'viagens' && <Viagens categorias={categorias} />}
        {aba === 'applepay' && <ApplePay />}
        {aba === 'relatorio' && <Relatorio base={base === 'USD' ? 'EUR' : base} setBase={setBase} />}
      </main>

      {/* barra inferior no celular */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-linha bg-cartao/90 backdrop-blur-xl sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}>
        <div className="grid grid-cols-6">
          {ABAS.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)} aria-current={abaMae === a.id ? 'page' : undefined}
              className={`flex min-w-0 flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold ${abaMae === a.id ? 'text-marca' : 'text-texto-3'}`}>
              <span className={`grid h-8 w-11 place-items-center rounded-full transition ${abaMae === a.id ? 'bg-marca-suave' : ''}`}><Icone nome={a.icone} className="h-5 w-5" forte={abaMae === a.id} /></span>
              {t(`abasCurto.${a.id}`)}
            </button>
          ))}
        </div>
      </nav>

      <Ajustes aberto={ajustes} aoFechar={() => setAjustes(false)} eu={eu} setEu={setEu} aoSair={() => { setAjustes(false); aoSair(); }} />
    </div>
  );
}
