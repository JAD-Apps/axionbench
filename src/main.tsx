import { createRoot } from 'react-dom/client';
import './style.css';
import { Observatory } from './observatory';

createRoot(document.getElementById('root')!).render(
  <Observatory />,
);
