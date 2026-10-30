import { describe, it, expect } from 'vitest';
import { DEFAULT_DISPLAY, devBlock, SCENARIOS, scenarioId } from './scenarios.js';

describe('scenarios', () => {
  it('maps every scenario to distinct ports', async () => {
    const seen = new Set<number>();
    for (const entry of Object.values(SCENARIOS)) {
      for (const port of [entry.ports.yoursWeb, entry.ports.firmWeb, entry.ports.firm, entry.ports.personal]) {
        expect(seen.has(port)).toBe(false);
        seen.add(port);
      }
    }
    expect(SCENARIOS.helios.ports.personal).toBe(8788);
  });

  it('reads the scenario id from the environment with a helios default', async () => {
    const saved = process.env.STEVENS_SCENARIO;
    delete process.env.STEVENS_SCENARIO;
    try {
      expect(scenarioId()).toBe('helios');
      process.env.STEVENS_SCENARIO = 'forge';
      expect(scenarioId()).toBe('forge');
    } finally {
      if (saved === undefined) delete process.env.STEVENS_SCENARIO;
      else process.env.STEVENS_SCENARIO = saved;
    }
  });

  it('keeps the default display on the helios contract', async () => {
    expect(DEFAULT_DISPLAY.roleTitles).toEqual({ Associate: 'Associate', Partner: 'Partner' });
    expect(DEFAULT_DISPLAY.reviewerNoun).toBe('a Partner');
    expect(DEFAULT_DISPLAY.labels).toEqual({
      sourcePrefix: 'Firm CRM', team: 'Deal team', restricted: 'Partners',
      workColumn: 'The deck says', personalColumn: 'You heard', unit: 'deals',
    });
    expect(DEFAULT_DISPLAY.firmDataLabel).toBe('Fictional firm data');
  });

  it('serves the dev block only under STEVENS_DEV=1', async () => {
    const savedDev = process.env.STEVENS_DEV;
    const savedScenario = process.env.STEVENS_SCENARIO;
    delete process.env.STEVENS_DEV;
    try {
      expect(devBlock()).toBeUndefined();
      process.env.STEVENS_DEV = '1';
      process.env.STEVENS_SCENARIO = 'mercy';
      const block = devBlock();
      expect(block?.scenario).toBe('mercy');
      expect(block?.scenarios.map((entry) => entry.id)).toEqual(['helios', 'forge', 'mercy']);
      expect(block?.scenarios[1].yoursUrl).toBe('http://localhost:5273');
      expect(block?.scenarios[2].firmUrl).toBe('http://localhost:5374');
    } finally {
      if (savedDev === undefined) delete process.env.STEVENS_DEV;
      else process.env.STEVENS_DEV = savedDev;
      if (savedScenario === undefined) delete process.env.STEVENS_SCENARIO;
      else process.env.STEVENS_SCENARIO = savedScenario;
    }
  });
});
