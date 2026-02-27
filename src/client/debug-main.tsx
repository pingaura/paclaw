import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import DebugApp from './debug/DebugApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DebugApp />
  </StrictMode>,
);
