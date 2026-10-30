import type { ScenarioDev, ScenarioDisplay } from '../../shared/data.js';

export interface ScenarioPorts { yoursWeb: number; firmWeb: number; firm: number; personal: number }

export const SCENARIOS: Record<string, { name: string; ports: ScenarioPorts }> = {
  helios: { name: 'Helios · Darlington Hall', ports: { yoursWeb: 5173, firmWeb: 5174, firm: 8787, personal: 8788 } },
  forge: { name: 'Forge · staff review', ports: { yoursWeb: 5273, firmWeb: 5274, firm: 8887, personal: 8888 } },
  mercy: { name: 'Mercy · tumor board', ports: { yoursWeb: 5373, firmWeb: 5374, firm: 8987, personal: 8988 } },
};

export function scenarioId(): string {
  return process.env.STEVENS_SCENARIO ?? 'helios';
}

export const DEFAULT_DISPLAY: ScenarioDisplay = {
  roleTitles: { Associate: 'Associate', Partner: 'Partner' },
  reviewerNoun: 'a Partner',
  labels: { sourcePrefix: 'Firm CRM', team: 'Deal team', restricted: 'Partners', workColumn: 'The deck says', personalColumn: 'You heard', unit: 'deals' },
  firmDataLabel: 'Fictional firm data',
};

export function devBlock(): ScenarioDev | undefined {
  if (process.env.STEVENS_DEV !== '1') return undefined;
  const scenarios = Object.entries(SCENARIOS).map(([id, entry]) => ({
    id,
    name: entry.name,
    yoursUrl: 'http://localhost:' + entry.ports.yoursWeb,
    firmUrl: 'http://localhost:' + entry.ports.firmWeb,
  }));
  return { scenario: scenarioId(), scenarios };
}
