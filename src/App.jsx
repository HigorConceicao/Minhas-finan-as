import { useCallback, useEffect, useState } from 'react';
import { get, post, sessao } from './api.js';
import { mesAtual } from './fmt.js';
import { Carregando, ProvedorAvisos, useAviso } from './components/ui.jsx';
import Visao from './components/Visao.jsx';
import Lancamentos from './components/Lancamentos.jsx';
import Orcamento from './components/Orcamento.jsx';
import Recorrentes from './components/Recorrentes.jsx';
import Rendimento from './components/Rendimento.jsx';

const DEMO = import.meta.env.MODE === 'demo';

const ABAS = [
  { id: 'visao', nome: 'Visão geral', curto: 'Início', icone: '⌂' },
  { id: 'lancamentos', nome: 'Lançamentos', curto: 'Lançam.', icone: '☰' },
  { id: 'orcamento', nome: 'Orçamento', curto: 'Orçam.', icone: '◑' },
  { id: 'recorrentes', nome: 'Recorrentes', curto: 'Recorr.', icone: '↻' },
  { id: 'rendimento', nome: 'Rendimento', curto: 'Rende', icone: '↗' },
];

const lerPref = (k, padrao) => { try { return localStorage.getItem(k) || padrao; } catch { return padrao; } };
const gravarPref = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

export default function App() {
  return <ProvedorAvisos><Porteiro /></ProvedorAvisos>;
}

function Porteiro() {
  const [estado, setEstado] = useState('verificando'); // verificando | login | ok
  useEffect(() => {
    get('/status').then((s) => {
      if (!s.protegido) { sessao.token = 'aberto'; setEstado('ok'); }
      else setEstado(sessao.token ? 'ok' : 'login');
    }).catch(() => setEstado('ok'));
    const sair = () => setEstado('login');
    window.addEventListener('mf2-sair', sair);
    return () => window.removeEventListener('mf2-sair', sair);
  }, []);
  if (estado === 'verificando') return <Carregando />;
  if (estado === 'login') return <Login aoEntrar={() => setEstado('ok')} />;
  return <Painel />;
}

function Login({ aoEntrar }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const entrar = async (e) => {
    e.preventDefault();
    try { const r = await post('/login', { senha }); sessao.token = r.token; aoEntrar(); }
    catch (err) { setErro(err.message); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={entrar} className="folha w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <p className="text-4xl">📒</p>
          <h1 className="mt-2 text-2xl">Minhas Finanças</h1>
        </div>
        <input type="password" className="campo" placeholder="Senha" value={senha} onChange={(e) => { setSenha(e.target.value); setErro(''); }} autoFocus />
        {erro && <p className="text-sm text-vermelho">{erro}</p>}
        <button className="btn-primario w-full">Entrar</button>
      </form>
    </div>
  );
}

function Painel() {
  const avisar = useAviso();
  const [aba, setAbaEstado] = useState(() => (location.hash.slice(1) && ABAS.some((a) => a.id === location.hash.slice(1)) ? location.hash.slice(1) : 'visao'));
  const [mes, setMes] = useState(mesAtual());
  const [base, setBaseEstado] = useState(() => lerPref('mf2-base', 'EUR'));
  const [categorias, setCategorias] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [novoSinal, setNovoSinal] = useState(0);

  useEffect(() => {
    const aoMudarHash = () => { const h = location.hash.slice(1); if (ABAS.some((a) => a.id === h)) setAbaEstado(h); };
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

  const novoLancamento = () => { setAba('lancamentos'); setNovoSinal(1); };
  const consumirNovo = useCallback(() => setNovoSinal(0), []);

  return (
    <div className="mx-auto min-h-screen max-w-5xl pb-24 sm:pb-10">
      <header className="sticky top-0 z-30 border-b border-linha bg-papel/95 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="flex items-center gap-2 text-xl font-semibold"><span aria-hidden>📒</span> Minhas Finanças</h1>
          {DEMO ? <span className="chip bg-ambar-claro text-ambar">Demonstração</span> : <a href="/api/exportar" className="text-xs text-tinta-fraca hover:text-tinta" title="Baixar backup em JSON"
            onClick={async (e) => {
              e.preventDefault();
              try {
                const r = await fetch('/api/exportar', { headers: sessao.token ? { authorization: `Bearer ${sessao.token}` } : {} });
                const blob = await r.blob();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob); a.download = `minhas-financas-${new Date().toISOString().slice(0, 10)}.json`; a.click();
              } catch { avisar('Não foi possível exportar', 'erro'); }
            }}>⤓ Backup</a>}
        </div>
        <nav className="hidden gap-1 px-3 pb-2 sm:flex">
          {ABAS.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${aba === a.id ? 'bg-couro text-papel-claro' : 'text-tinta-suave hover:bg-papel-escuro'}`}>
              {a.nome}
            </button>
          ))}
        </nav>
      </header>

      <main className="px-4 py-5">
        {aba === 'visao' && <Visao mes={mes} setMes={setMes} base={base} setBase={setBase} resumo={resumo} irPara={setAba} novoLancamento={novoLancamento} />}
        {aba === 'lancamentos' && <Lancamentos mes={mes} setMes={setMes} categorias={categorias} novoSinal={novoSinal} aoConsumirNovo={consumirNovo} />}
        {aba === 'orcamento' && <Orcamento mes={mes} setMes={setMes} base={base} resumo={resumo} categorias={categorias} recarregar={recarregarTudo} />}
        {aba === 'recorrentes' && <Recorrentes categorias={categorias} />}
        {aba === 'rendimento' && <Rendimento />}
      </main>

      {/* navegação inferior no celular */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-linha bg-papel-claro/95 backdrop-blur sm:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${aba === a.id ? 'text-couro' : 'text-tinta-fraca'}`}>
            <span className="text-lg leading-none">{a.icone}</span>{a.curto}
          </button>
        ))}
      </nav>
    </div>
  );
}
