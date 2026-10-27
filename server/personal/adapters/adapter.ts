import type { Origin, RawItem } from '../../../shared/data.js';

export type { Origin };
export type { RawItem };

export interface Adapter {
  origin: Origin;
  label: string;
  poll(): Promise<RawItem[]>;
  watch(onItems: (items: RawItem[]) => void): () => void;
}
