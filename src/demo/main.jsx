import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from '../App.jsx';
import { useT } from '../i18n.js';
import { instalarDemo, restaurarExemplo } from './mockApi.js';
import '../index.css';

instalarDemo();

function Faixa({ aoRestaurar }) {
  const t = useT();
  return (
    <div className="bg-aviso-suave px-4 py-2.5 text-center text-xs text-texto">
      {t('demo.aviso')}{' '}
      <button className="font-bold text-marca underline underline-offset-2" onClick={aoRestaurar}>{t('demo.restaurar')}</button>
    </div>
  );
}

function Demo() {
  const [chave, setChave] = useState(0);
  return <App key={chave} antes={<Faixa aoRestaurar={() => { restaurarExemplo(); setChave((k) => k + 1); }} />} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><Demo /></React.StrictMode>);
