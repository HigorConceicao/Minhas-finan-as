import { useEffect, useState } from 'react';
import { get, post } from '../api.js';
import { IDIOMAS, useIdioma, useT } from '../i18n.js';
import { Carregando, Segmentado } from './ui.jsx';
import Icone from './Icones.jsx';

/** Links que chegam por e-mail ou mensagem: #convite=TOKEN e #redefinir=TOKEN */
export function linkDeAcesso() {
  const m = location.hash.match(/^#(convite|redefinir)=([A-Za-z0-9_-]{20,})$/);
  return m ? { tipo: m[1], token: m[2] } : null;
}
const limparHash = () => history.replaceState(null, '', location.pathname + location.search);

function Moldura({ titulo, sub, children }) {
  const { idioma, setIdioma } = useIdioma();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-5">
      <div className="cartao w-full max-w-sm p-7">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-marca text-sobre-marca"><Icone nome="rendimento" className="h-7 w-7" forte /></span>
          <h1 className="mt-4 text-2xl">{titulo}</h1>
          {sub && <p className="mt-1.5 text-sm text-texto-2">{sub}</p>}
        </div>
        {children}
      </div>
      <Segmentado className="w-64" valor={idioma} aoMudar={setIdioma} opcoes={IDIOMAS.map((i) => [i.id, i.id.toUpperCase()])} />
    </div>
  );
}

function CampoSenha({ id, valor, aoMudar, rotulo, novo, autoFocus }) {
  const [ver, setVer] = useState(false);
  const t = useT();
  return (
    <label htmlFor={id} className="block">
      <span className="rotulo mb-1.5 block">{rotulo}</span>
      <span className="relative block">
        <input id={id} type={ver ? 'text' : 'password'} className="campo pr-20" value={valor} onChange={(e) => aoMudar(e.target.value)}
          autoComplete={novo ? 'new-password' : 'current-password'} minLength={novo ? 8 : undefined} required autoFocus={autoFocus} />
        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-xs font-semibold text-texto-2 hover:bg-sutil" onClick={() => setVer((x) => !x)}>
          {ver ? t('acesso.ocultar') : t('acesso.mostrar')}
        </button>
      </span>
      {novo && <span className="mt-1.5 block text-xs text-texto-3">{t('acesso.minimo')}</span>}
    </label>
  );
}

const Erro = ({ texto }) => (texto ? <p className="rounded-xl bg-neg-suave p-3 text-sm font-semibold text-neg" role="alert">{texto}</p> : null);

/**
 * Tela de acesso. modo: 'entrar' | 'primeiro' | 'convite' | 'redefinir'.
 * `aoEntrar(eu)` é chamado quando há uma sessão.
 */
export default function Acesso({ status, aoEntrar }) {
  const t = useT();
  const { idioma } = useIdioma();
  const link = linkDeAcesso();
  const [modo, setModo] = useState(link?.tipo || (status.temUsuarios ? 'entrar' : 'primeiro'));
  const [f, setF] = useState({ nome: '', email: '', senha: '', senha2: '', senhaApp: '' });
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [convite, setConvite] = useState(null); // { valido, email }
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: typeof v === 'string' ? v : v.target.value })); setErro(''); };

  useEffect(() => {
    if (link?.tipo === 'convite') get(`/auth/convite/${link.token}`).then((c) => { setConvite(c); if (c.email) setF((x) => ({ ...x, email: c.email })); }).catch(() => setConvite({ valido: false }));
    if (link?.tipo === 'redefinir') get(`/auth/redefinir/${link.token}`).then(setConvite).catch(() => setConvite({ valido: false }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (e, fazer) => {
    e.preventDefault();
    setOcupado(true); setErro('');
    try { await fazer(); } catch (err) { setErro(err.message); } finally { setOcupado(false); }
  };
  const confere = () => { if (f.senha !== f.senha2) throw new Error(t('acesso.naoConferem')); };

  if (modo === 'esqueci') return (
    <Moldura titulo={t('acesso.esqueciTitulo')} sub={enviado ? null : t('acesso.esqueciSub')}>
      {enviado ? (
        <div className="space-y-4 text-center text-sm">
          <p className="rounded-xl bg-pos-suave p-4 font-semibold text-pos">{t('acesso.esqueciEnviado', { e: f.email })}</p>
          <p className="text-texto-3">{t('acesso.esqueciDica')}</p>
          <button className="btn-secundario w-full" onClick={() => { setModo('entrar'); setEnviado(false); }}>{t('acesso.voltar')}</button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => enviar(e, async () => { await post('/auth/esqueci', { email: f.email, idioma }); setEnviado(true); })}>
          <label className="block"><span className="rotulo mb-1.5 block">{t('acesso.email')}</span>
            <input id="ac-email" type="email" className="campo" value={f.email} onChange={set('email')} autoComplete="email" required autoFocus /></label>
          <Erro texto={erro} />
          <button className="btn-primario w-full" disabled={ocupado}>{t('acesso.enviarLink')}</button>
          <button type="button" className="w-full text-center text-sm font-semibold text-marca" onClick={() => setModo('entrar')}>{t('acesso.voltar')}</button>
        </form>
      )}
    </Moldura>
  );

  if (modo === 'redefinir') return (
    <Moldura titulo={t('acesso.redefinirTitulo')}>
      {!convite ? <Carregando /> : !convite.valido ? (
        <div className="space-y-4 text-center">
          <Erro texto={t('erro.link_invalido')} />
          <button className="btn-secundario w-full" onClick={() => { limparHash(); setModo('esqueci'); }}>{t('acesso.pedirOutro')}</button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => enviar(e, async () => { confere(); const r = await post('/auth/redefinir', { token: link.token, senha: f.senha }); limparHash(); aoEntrar(r.eu); })}>
          <CampoSenha id="ac-nova" rotulo={t('acesso.novaSenha')} valor={f.senha} aoMudar={set('senha')} novo autoFocus />
          <CampoSenha id="ac-nova2" rotulo={t('acesso.repetir')} valor={f.senha2} aoMudar={set('senha2')} novo />
          <Erro texto={erro} />
          <button className="btn-primario w-full" disabled={ocupado}>{t('acesso.salvarEntrar')}</button>
        </form>
      )}
    </Moldura>
  );

  if (modo === 'convite') return (
    <Moldura titulo={t('acesso.conviteTitulo')} sub={t('acesso.conviteSub')}>
      {!convite ? <Carregando /> : !convite.valido ? (
        <div className="space-y-4 text-center">
          <Erro texto={t('erro.convite_invalido')} />
          <button className="btn-secundario w-full" onClick={() => { limparHash(); setModo('entrar'); }}>{t('acesso.jaTenho')}</button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => enviar(e, async () => { confere(); const r = await post('/auth/cadastro', { token: link.token, nome: f.nome, email: f.email, senha: f.senha }); limparHash(); aoEntrar(r.eu); })}>
          <label className="block"><span className="rotulo mb-1.5 block">{t('acesso.nome')}</span><input id="ac-nome" className="campo" value={f.nome} onChange={set('nome')} autoComplete="name" required autoFocus /></label>
          <label className="block"><span className="rotulo mb-1.5 block">{t('acesso.email')}</span>
            <input id="ac-email" type="email" className="campo" value={f.email} onChange={set('email')} autoComplete="email" required readOnly={!!convite.email} /></label>
          <CampoSenha id="ac-senha" rotulo={t('acesso.senha')} valor={f.senha} aoMudar={set('senha')} novo />
          <CampoSenha id="ac-senha2" rotulo={t('acesso.repetir')} valor={f.senha2} aoMudar={set('senha2')} novo />
          <Erro texto={erro} />
          <button className="btn-primario w-full" disabled={ocupado}>{t('acesso.criarConta')}</button>
        </form>
      )}
    </Moldura>
  );

  if (modo === 'primeiro') return (
    <Moldura titulo={t('acesso.primeiroTitulo')} sub={t('acesso.primeiroSub')}>
      <form className="space-y-4" onSubmit={(e) => enviar(e, async () => { confere(); const r = await post('/auth/primeiro', { nome: f.nome, email: f.email, senha: f.senha, senhaApp: f.senhaApp }); aoEntrar(r.eu); })}>
        {status.precisaSenhaApp && (
          <CampoSenha id="ac-app" rotulo={t('acesso.senhaApp')} valor={f.senhaApp} aoMudar={set('senhaApp')} autoFocus />
        )}
        <label className="block"><span className="rotulo mb-1.5 block">{t('acesso.nome')}</span><input id="ac-nome" className="campo" value={f.nome} onChange={set('nome')} autoComplete="name" required autoFocus={!status.precisaSenhaApp} /></label>
        <label className="block"><span className="rotulo mb-1.5 block">{t('acesso.email')}</span><input id="ac-email" type="email" className="campo" value={f.email} onChange={set('email')} autoComplete="email" required /></label>
        <CampoSenha id="ac-senha" rotulo={t('acesso.senha')} valor={f.senha} aoMudar={set('senha')} novo />
        <CampoSenha id="ac-senha2" rotulo={t('acesso.repetir')} valor={f.senha2} aoMudar={set('senha2')} novo />
        <Erro texto={erro} />
        <button className="btn-primario w-full" disabled={ocupado}>{t('acesso.criarConta')}</button>
        <p className="text-center text-xs text-texto-3">{t('acesso.primeiroDica')}</p>
      </form>
    </Moldura>
  );

  return (
    <Moldura titulo={t('app.nome')} sub={t('acesso.entrarSub')}>
      <form className="space-y-4" onSubmit={(e) => enviar(e, async () => { const r = await post('/auth/entrar', { email: f.email, senha: f.senha }); aoEntrar(r.eu); })}>
        <label className="block"><span className="rotulo mb-1.5 block">{t('acesso.email')}</span>
          <input id="ac-email" type="email" className="campo" value={f.email} onChange={set('email')} autoComplete="username" required autoFocus /></label>
        <CampoSenha id="ac-senha" rotulo={t('acesso.senha')} valor={f.senha} aoMudar={set('senha')} />
        <Erro texto={erro} />
        <button className="btn-primario w-full" disabled={ocupado}>{t('login.entrar')}</button>
        <button type="button" className="w-full text-center text-sm font-semibold text-marca" onClick={() => setModo('esqueci')}>{t('acesso.esqueci')}</button>
      </form>
    </Moldura>
  );
}
