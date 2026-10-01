import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { MicrosoftTodoProvider } from './integrations/microsoft/MicrosoftTodoContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MicrosoftTodoProvider>
      <App />
    </MicrosoftTodoProvider>
  </StrictMode>,
);
