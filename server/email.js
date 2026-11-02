// Envio de e-mails (recuperação de senha e convites).
// Preferência: Brevo (API HTTP, porta 443 — funciona no Railway Hobby, que bloqueia SMTP).
//   Variáveis: BREVO_API_KEY e EMAIL_REMETENTE (o e-mail verificado como remetente no Brevo).
// Alternativa: Gmail por SMTP (GMAIL_USER + GMAIL_APP_PASSWORD) — só funciona onde a porta SMTP é liberada.
import nodemailer from 'nodemailer';

const BREVO = (process.env.BREVO_API_KEY || '').trim();
const GMAIL = process.env.GMAIL_USER || '';
const SENHA = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const REMETENTE = (process.env.EMAIL_REMETENTE || GMAIL).trim();
let transporte = null;

export const emailConfigurado = () => !!((BREVO && REMETENTE) || (GMAIL && SENHA));

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TEXTOS = {
  pt: {
    redefinir: { assunto: 'Redefinir sua senha – Minhas Finanças', ola: 'Olá, {nome}!', corpo: 'Recebemos um pedido para redefinir a senha da sua conta. O link vale por 1 hora e só pode ser usado uma vez.', botao: 'Criar nova senha', ignore: 'Se não foi você, ignore este e-mail: sua senha continua a mesma.' },
    convite: { assunto: '{de} convidou você para o Minhas Finanças', ola: 'Olá!', corpo: '{de} convidou você para usar o Minhas Finanças. Suas finanças ficam só na sua conta. O convite vale por 7 dias.', botao: 'Criar minha conta', ignore: 'Se você não esperava este convite, ignore este e-mail.' },
  },
  de: {
    redefinir: { assunto: 'Passwort zurücksetzen – Meine Finanzen', ola: 'Hallo {nome}!', corpo: 'Wir haben eine Anfrage zum Zurücksetzen deines Passworts erhalten. Der Link gilt 1 Stunde und nur einmal.', botao: 'Neues Passwort festlegen', ignore: 'Warst du das nicht, ignoriere diese E-Mail: Dein Passwort bleibt gleich.' },
    convite: { assunto: '{de} hat dich zu Meine Finanzen eingeladen', ola: 'Hallo!', corpo: '{de} hat dich eingeladen, Meine Finanzen zu nutzen. Deine Daten bleiben in deinem Konto. Die Einladung gilt 7 Tage.', botao: 'Konto erstellen', ignore: 'Falls du diese Einladung nicht erwartet hast, ignoriere diese E-Mail.' },
  },
  en: {
    redefinir: { assunto: 'Reset your password – My Finances', ola: 'Hi {nome}!', corpo: 'We received a request to reset your password. The link is valid for 1 hour and can be used once.', botao: 'Choose a new password', ignore: 'If this wasn’t you, ignore this email: your password stays the same.' },
    convite: { assunto: '{de} invited you to My Finances', ola: 'Hi!', corpo: '{de} invited you to use My Finances. Your data stays in your own account. The invite is valid for 7 days.', botao: 'Create my account', ignore: 'If you weren’t expecting this invite, ignore this email.' },
  },
};

async function viaBrevo({ para, assunto, html, texto }) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: 'Minhas Finanças', email: REMETENTE }, to: [{ email: para }], subject: assunto, htmlContent: html, textContent: texto }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

async function viaGmail({ para, assunto, html, texto }) {
  if (!transporte) transporte = nodemailer.createTransport({
    service: 'gmail', auth: { user: GMAIL, pass: SENHA },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  await transporte.sendMail({ from: `"Minhas Finanças" <${GMAIL}>`, to: para, subject: assunto, text: texto, html });
}

export async function enviarEmail({ para, idioma = 'pt', modelo, dados }) {
  if (!emailConfigurado()) { console.warn(`E-mail não configurado (BREVO_API_KEY ou GMAIL_USER/GMAIL_APP_PASSWORD): não enviado para ${para}`); return false; }
  const tx = (TEXTOS[idioma] || TEXTOS.pt)[modelo];
  const f = (s) => s.replace(/\{(\w+)\}/g, (_, k) => dados[k] ?? '');
  const fh = (s) => s.replace(/\{(\w+)\}/g, (_, k) => escapar(dados[k] ?? ''));
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#141a2e">
  <div style="max-width:480px;margin:24px auto;background:#fff;border-radius:20px;padding:28px">
    <p style="font-size:18px;font-weight:700;margin:0 0 12px">${fh(tx.ola)}</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 22px">${fh(tx.corpo)}</p>
    <a href="${escapar(dados.link)}" style="display:inline-block;background:#2952eb;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px">${escapar(tx.botao)}</a>
    <p style="font-size:12px;color:#6b7185;margin:22px 0 0;word-break:break-all">${escapar(dados.link)}</p>
    <p style="font-size:12px;color:#6b7185;margin:12px 0 0">${escapar(tx.ignore)}</p>
  </div></body></html>`;
  const msg = { para, assunto: f(tx.assunto), html, texto: `${f(tx.ola)}\n\n${f(tx.corpo)}\n\n${dados.link}\n\n${tx.ignore}` };
  if (BREVO && REMETENTE) await viaBrevo(msg); else await viaGmail(msg);
  return true;
}
