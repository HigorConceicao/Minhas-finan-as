import { useState } from 'react';
import { compacto, dinheiro, mesCurto } from '../fmt.js';

const L = 720, A = 220, M = { t: 12, r: 12, b: 28, l: 56 };

const escala = (max) => {
  if (max <= 0) return [0, 1];
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const passo = [1, 2, 2.5, 5, 10].map((x) => x * p).find((s) => max / s <= 4) || p * 10;
  return [Math.ceil(max / passo) * passo, passo];
};

/** Barras agrupadas: juros (verde) x saídas (vermelho) por mês */
export function BarrasJurosSaidas({ serie, moeda }) {
  const [foco, setFoco] = useState(null);
  const dados = serie.slice(-12);
  const [topo, passo] = escala(Math.max(...dados.map((d) => Math.max(d.juros, d.saidas)), 0));
  const w = (L - M.l - M.r) / Math.max(dados.length, 1);
  const y = (v) => M.t + (A - M.t - M.b) * (1 - v / topo);
  const bw = Math.min(18, w / 3);
  const ticks = []; for (let v = 0; v <= topo + 1e-9; v += passo) ticks.push(v);
  const f = foco !== null ? dados[foco] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full" role="img" aria-label="Juros e saídas por mês">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={L - M.r} y1={y(t)} y2={y(t)} stroke="#d9cdb6" strokeDasharray={t ? '3 4' : ''} />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#8f8476">{compacto(t, moeda)}</text>
          </g>
        ))}
        {dados.map((d, i) => {
          const cx = M.l + w * i + w / 2;
          return (
            <g key={d.mes} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} onClick={() => setFoco(i)}>
              <rect x={M.l + w * i} y={M.t} width={w} height={A - M.t - M.b} fill={foco === i ? 'rgba(110,74,46,.06)' : 'transparent'} />
              <rect x={cx - bw - 1} y={y(d.juros)} width={bw} height={Math.max(0, y(0) - y(d.juros))} rx="3" fill="#2f6b4f" />
              <rect x={cx + 1} y={y(d.saidas)} width={bw} height={Math.max(0, y(0) - y(d.saidas))} rx="3" fill="#a33a2c" />
              <text x={cx} y={A - 8} textAnchor="middle" fontSize="11" fill="#5c5248">{mesCurto(d.mes)}</text>
            </g>
          );
        })}
      </svg>
      {f && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg border border-linha bg-papel-claro px-3 py-2 text-xs shadow">
          <p className="font-semibold capitalize">{mesCurto(f.mes)}</p>
          <p className="text-verde">Juros {dinheiro(f.juros, moeda)}</p>
          <p className="text-vermelho">Saídas {dinheiro(f.saidas, moeda)}</p>
          <p>Líquido {dinheiro(f.liquido, moeda)}</p>
        </div>
      )}
      <div className="mt-1 flex gap-4 text-xs text-tinta-suave">
        <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-verde" /> Juros</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-vermelho" /> Saídas</span>
      </div>
    </div>
  );
}

/** Linha do saldo: histórico (contínuo) + projeção (tracejado) */
export function LinhaSaldo({ serie, projecao, moeda }) {
  const [foco, setFoco] = useState(null);
  const hist = serie.slice(-12).map((d) => ({ mes: d.mes, v: d.fechamento, p: false }));
  const proj = projecao.map((d) => ({ mes: d.mes, v: d.saldo, p: true }));
  const pts = [...hist, ...proj];
  if (!pts.length) return null;
  const vals = pts.map((p) => p.v);
  const min0 = Math.min(...vals), max0 = Math.max(...vals);
  const folga = (max0 - min0) * 0.15 || max0 * 0.02 || 1;
  const min = Math.max(0, min0 - folga), max = max0 + folga;
  const x = (i) => M.l + ((L - M.l - M.r) * i) / Math.max(pts.length - 1, 1);
  const y = (v) => M.t + (A - M.t - M.b) * (1 - (v - min) / (max - min));
  const caminho = (arr, off) => arr.map((p, i) => `${i ? 'L' : 'M'}${x(i + off).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const iCorte = hist.length - 1;
  const f = foco !== null ? pts[foco] : null;
  const ticks = [min, (min + max) / 2, max];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full" role="img" aria-label="Evolução e projeção do saldo"
        onMouseLeave={() => setFoco(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * L;
          setFoco(Math.max(0, Math.min(pts.length - 1, Math.round(((px - M.l) / (L - M.l - M.r)) * (pts.length - 1)))));
        }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={M.l} x2={L - M.r} y1={y(t)} y2={y(t)} stroke="#d9cdb6" strokeDasharray="3 4" />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#8f8476">{compacto(t, moeda)}</text>
          </g>
        ))}
        {hist.length > 0 && proj.length > 0 && (
          <rect x={x(iCorte)} y={M.t} width={L - M.r - x(iCorte)} height={A - M.t - M.b} fill="rgba(176,122,31,.06)" />
        )}
        <path d={caminho(hist, 0)} fill="none" stroke="#6e4a2e" strokeWidth="2.5" strokeLinejoin="round" />
        {proj.length > 0 && (
          <path d={caminho([hist[hist.length - 1] || proj[0], ...proj], hist.length ? iCorte : 0)} fill="none" stroke="#b07a1f" strokeWidth="2" strokeDasharray="6 5" />
        )}
        {pts.map((p, i) => (i % Math.ceil(pts.length / 8) === 0 || i === pts.length - 1) && (
          <text key={p.mes} x={x(i)} y={A - 8} textAnchor="middle" fontSize="11" fill="#5c5248">{mesCurto(p.mes)}</text>
        ))}
        {f && (
          <g>
            <line x1={x(foco)} x2={x(foco)} y1={M.t} y2={A - M.b} stroke="#8f8476" strokeDasharray="2 3" />
            <circle cx={x(foco)} cy={y(f.v)} r="4.5" fill={f.p ? '#b07a1f' : '#6e4a2e'} stroke="#fbf8f1" strokeWidth="2" />
          </g>
        )}
      </svg>
      {f && (
        <div className="pointer-events-none absolute left-16 top-0 rounded-lg border border-linha bg-papel-claro px-3 py-2 text-xs shadow">
          <p className="font-semibold">{mesCurto(f.mes)} {f.p && <span className="text-ambar">(projeção)</span>}</p>
          <p className="num">{dinheiro(f.v, moeda)}</p>
        </div>
      )}
      <div className="mt-1 flex gap-4 text-xs text-tinta-suave">
        <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-couro" /> Saldo real</span>
        <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 border-t-2 border-dashed border-ambar" /> Projeção 12 meses</span>
      </div>
    </div>
  );
}
