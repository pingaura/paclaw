import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import TeamApp from './team/TeamApp';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TeamApp />
  </StrictMode>,
);
