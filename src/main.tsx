import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { bootContext } from './data/boot';

const { ctx, fixtures } = await bootContext();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App ctx={ctx} fixtures={fixtures} />
  </StrictMode>,
);
