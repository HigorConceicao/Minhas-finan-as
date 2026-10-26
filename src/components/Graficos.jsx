import { useState } from 'react';
import { compacto, dinheiro, mesCurto } from '../fmt.js';
import { useT } from '../i18n.js';

const L = 720, A = 230, M = { t: 14, r: 20, b: 30, l: 74 };

const escala = (max) => {
  if (max <= 0) return [1, 1];
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const passo = [1, 2, 2.5, 5, 10].map((x) => x * p).find((s) => max / s <= 4) || p * 10;
  return [Math.ceil(max / passo) * passo, passo];
};

/** Barras: juros (verde) × saídas (vermelho) por mês */
export function BarrasJurosSaidas({ serie, moeda }) {
  const t = useT();
  const [foco, setFoco] = useState(null);
  const dados = serie.slice(-12);
  const [topo, passo] = escala(Math.max(...dados.map((d) => Math.max(d.juros, d.saidas)), 0));
  const w = (L - M.l - M.r) / Math.max(dados.length, 1);
  const y = (v) => M.t + (A - M.t - M.b) * (1 - v / topo);
  const bw = Math.min(16, w / 3.2);
  const ticks = []; for (let v = 0; v <= topo + 1e-9; v += passo) ticks.push(v);
  const f = foco !== null ? dados[foco] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full" role="img" aria-label={t('rend.ariaBarras')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={L - M.r} y1={y(v)} y2={y(v)} className="stroke-linha" strokeDasharray={v ? '3 5' : ''} />
            <text x={M.l - 10} y={y(v) + 4} textAnchor="end" fontSize="11" className="fill-texto-3">{compacto(v, moeda)}</text>
          </g>
        ))}
        {dados.map((d, i) => {
          const cx = M.l + w * i + w / 2;
          return (
            <g key={d.mes} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} onClick={() => setFoco(i)}>
              <rect x={M.l + w * i} y={M.t} width={w} height={A - M.t - M.b} rx="10" className={foco === i ? 'fill-sutil' : 'fill-transparent'} />
              <rect x={cx - bw - 1.5} y={y(d.juros)} width={bw} height={Math.max(0, y(0) - y(d.juros))} rx={bw / 2.5} className="fill-pos" />
              <rect x={cx + 1.5} y={y(d.saidas)} width={bw} height={Math.max(0, y(0) - y(d.saidas))} rx={bw / 2.5} className="fill-neg" />
              <text x={cx} y={A - 9} textAnchor="middle" fontSize="11" className="fill-texto-2">{mesCurto(d.mes)}</text>
            </g>
          );
        })}
      </svg>
      {f && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-2xl bg-cartao px-3 py-2 text-xs shadow-flutua">
          <p className="font-bold">{mesCurto(f.mes)}</p>
          <p className="num text-pos">{t('rend.legJuros')} {dinheiro(f.juros, moeda)}</p>
          <p className="num text-neg">{t('rend.legSaidas')} {dinheiro(f.saidas, moeda)}</p>
        </div>
      )}
      <div className="mt-2 flex gap-4 text-xs font-semibold text-texto-2">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-pos" /> {t('rend.legJuros')}</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-neg" /> {t('rend.legSaidas')}</span>
      </div>
    </div>
  );
}

/** Linha do saldo: histórico (contínuo, com área) + projeção (tracejado) */
export function LinhaSaldo({ serie, projecao, moeda }) {
  const t = useT();
  const [foco, setFoco] = useState(null);
  const hist = serie.slice(-12).map((d) => ({ mes: d.mes, v: d.fechamento, p: false }));
  const proj = projecao.map((d) => ({ mes: d.mes, v: d.saldo, p: true }));
  const pts = [...hist, ...proj];
  if (!pts.length) return null;
  const vals = pts.map((p) => p.v);
  const min0 = Math.min(...vals), max0 = Math.max(...vals);
  const folga = (max0 - min0) * 0.18 || max0 * 0.02 || 1;
  const min = Math.max(0, min0 - folga), max = max0 + folga;
  const x = (i) => M.l + ((L - M.l - M.r) * i) / Math.max(pts.length - 1, 1);
  const y = (v) => M.t + (A - M.t - M.b) * (1 - (v - min) / (max - min));
  const linha = (arr, off) => arr.map((p, i) => `${i ? 'L' : 'M'}${x(i + off).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const iCorte = hist.length - 1;
  const area = hist.length > 1 ? `${linha(hist, 0)} L${x(iCorte)},${A - M.b} L${x(0)},${A - M.b} Z` : '';
  const f = foco !== null ? pts[foco] : null;
  const ticks = [min, (min + max) / 2, max];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full" role="img" aria-label={t('rend.ariaLinha')}
        onMouseLeave={() => setFoco(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * L;
          setFoco(Math.max(0, Math.min(pts.length - 1, Math.round(((px - M.l) / (L - M.l - M.r)) * (pts.length - 1)))));
        }}>
        <defs>
          <linearGradient id="areaSaldo" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" className="[stop-color:rgb(var(--marca))]" stopOpacity="0.22" />
            <stop offset="100%" className="[stop-color:rgb(var(--marca))]" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={M.l} x2={L - M.r} y1={y(v)} y2={y(v)} className="stroke-linha" strokeDasharray="3 5" />
            <text x={M.l - 10} y={y(v) + 4} textAnchor="end" fontSize="11" className="fill-texto-3">{compacto(v, moeda)}</text>
          </g>
        ))}
        {area && <path d={area} fill="url(#areaSaldo)" />}
        <path d={linha(hist, 0)} fill="none" className="stroke-marca" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {proj.length > 0 && (
          <path d={linha([hist[hist.length - 1] || proj[0], ...proj], hist.length ? iCorte : 0)} fill="none" className="stroke-texto-3" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" />
        )}
        {hist.length > 0 && <circle cx={x(iCorte)} cy={y(hist[iCorte].v)} r="4.5" className="fill-marca stroke-cartao" strokeWidth="2.5" />}
        {pts.map((p, i) => (i % Math.ceil(pts.length / 8) === 0 || i === pts.length - 1) && (
          <text key={p.mes} x={x(i)} y={A - 9} textAnchor="middle" fontSize="11" className="fill-texto-2">{mesCurto(p.mes)}</text>
        ))}
        {f && (
          <g>
            <line x1={x(foco)} x2={x(foco)} y1={M.t} y2={A - M.b} className="stroke-texto-3" strokeDasharray="2 4" />
            <circle cx={x(foco)} cy={y(f.v)} r="5" className={`${f.p ? 'fill-texto-3' : 'fill-marca'} stroke-cartao`} strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {f && (
        <div className="pointer-events-none absolute left-16 top-0 rounded-2xl bg-cartao px-3 py-2 text-xs shadow-flutua">
          <p className="font-bold">{mesCurto(f.mes)} {f.p && <span className="font-semibold text-texto-3">{t('rend.projecaoTag')}</span>}</p>
          <p className="num">{dinheiro(f.v, moeda)}</p>
        </div>
      )}
      <div className="mt-2 flex gap-4 text-xs font-semibold text-texto-2">
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 rounded bg-marca" /> {t('rend.legSaldo')}</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 border-t-2 border-dashed border-texto-3" /> {t('rend.legProj')}</span>
      </div>
    </div>
  );
}

/** Barras agrupadas por mês, várias séries (ex.: entradas × saídas × rendimentos). No celular, desenha em escala menor para o texto continuar legível. */
export function BarrasMensais({ meses, series, moeda, aria }) {
  const [foco, setFoco] = useState(null);
  const estreito = typeof window !== 'undefined' && window.innerWidth < 640;
  const W = estreito ? 360 : L, H = estreito ? 210 : A;
  const Mg = estreito ? { t: 10, r: 6, b: 26, l: 46 } : M;
  const [topo, passo] = escala(Math.max(0, ...series.flatMap((s) => s.valores)));
  const w = (W - Mg.l - Mg.r) / Math.max(meses.length, 1);
  const y = (v) => Mg.t + (H - Mg.t - Mg.b) * (1 - Math.max(0, v) / topo);
  const bw = Math.max(2, Math.min(14, (w - (estreito ? 4 : 8)) / series.length - 1));
  const ticks = []; for (let v = 0; v <= topo + 1e-9; v += passo) ticks.push(v);
  const fs = estreito ? 10 : 11;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={aria}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={Mg.l} x2={W - Mg.r} y1={y(v)} y2={y(v)} className="stroke-linha" strokeDasharray={v ? '3 5' : ''} />
            <text x={Mg.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={fs} className="fill-texto-3">{compacto(v, moeda)}</text>
          </g>
        ))}
        {meses.map((m, i) => {
          const x0 = Mg.l + w * i + (w - series.length * (bw + 1)) / 2;
          return (
            <g key={m} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} onClick={() => setFoco(i)}>
              <rect x={Mg.l + w * i} y={Mg.t} width={w} height={H - Mg.t - Mg.b} rx="6" className={foco === i ? 'fill-sutil' : 'fill-transparent'} />
              {series.map((s, j) => (
                <rect key={s.chave} x={x0 + j * (bw + 1)} y={y(s.valores[i])} width={bw} height={Math.max(0, y(0) - y(s.valores[i]))} rx={Math.min(3, bw / 2.5)} className={s.classe} />
              ))}
              <text x={Mg.l + w * i + w / 2} y={H - 8} textAnchor="middle" fontSize={fs} className="fill-texto-2">{estreito ? mesCurto(m).slice(0, 1).toUpperCase() : mesCurto(m)}</text>
            </g>
          );
        })}
      </svg>
      {foco !== null && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-2xl bg-cartao px-3 py-2 text-xs shadow-flutua">
          <p className="font-bold">{mesCurto(meses[foco])}</p>
          {series.map((s) => <p key={s.chave} className={`num ${s.texto}`}>{s.rotulo} {dinheiro(s.valores[foco], moeda)}</p>)}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold text-texto-2">
        {series.map((s) => <span key={s.chave} className="flex items-center gap-1.5"><i className={`inline-block h-2.5 w-2.5 rounded-full ${s.cor}`} /> {s.rotulo}</span>)}
      </div>
    </div>
  );
}
