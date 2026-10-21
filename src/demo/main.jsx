import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from '../App.jsx';
import { instalarDemo, restaurarExemplo } from './mockApi.js';
import '../index.css';

instalarDemo();

function Demo() {
  const [chave, setChave] = useState(0);
  return (
    <>
      <div className="border-b border-ambar/30 bg-ambar-claro px-4 py-2 text-center text-xs text-tinta">
        Demonstração com dados de exemplo. Pode lançar, editar e apagar à vontade: nada é salvo, e ao recarregar a página tudo volta ao início.{' '}
        <button className="font-semibold text-couro underline underline-offset-2" onClick={() => { restaurarExemplo(); setChave((k) => k + 1); }}>
          Restaurar exemplo
        </button>
      </div>
      <App key={chave} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><Demo /></React.StrictMode>);
