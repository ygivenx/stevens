import { watch, type FSWatcher } from 'node:fs';

export function watchDir(dir: string, onSettle: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let watcher: FSWatcher | null = null;
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        onSettle();
      } catch {
        void 0;
      }
    }, 1000);
  };
  try {
    watcher = watch(dir, debounced);
  } catch {
    return () => {};
  }
  return () => {
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}
