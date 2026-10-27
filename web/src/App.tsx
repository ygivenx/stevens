import { useEffect, useState } from 'react';

export default function App() {
  const [state, setState] = useState('loading');
  useEffect(() => {
    fetch('/api/state', { headers: { 'X-Viewer-Role': 'Associate' } })
      .then((r) => r.json())
      .then((j) => setState(JSON.stringify(j)))
      .catch((e) => setState('error: ' + String(e)));
  }, []);
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>Stevens</h1>
      <p>Stevens drafts; the human decides.</p>
      <pre>{state}</pre>
    </main>
  );
}
