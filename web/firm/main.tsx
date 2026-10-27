import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/tokens.css';

function FirmPlaceholder() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-brass">A chief of staff</p>
      <h1 className="mt-1 font-display text-5xl">Stevens</h1>
      <p className="mt-1 font-display text-lg italic text-smoke">firm · Partner app arrives day 14</p>
      <p className="mt-4 text-sm text-smoke">The Associate app is ready on :5173. This placeholder keeps :5174 healthy.</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FirmPlaceholder />
  </StrictMode>
);
