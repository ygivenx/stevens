import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FLOWS = {
  capture: [
    { tab: 'Capture' },
    { expect: 'Personal vault' },
    { expect: 'Speaker A' },
  ],
  brief: [
    { tab: 'Brief' },
    { expect: 'Before the second Helios meeting' },
    { expect: 'visible to you only' },
  ],
  answer: [
    { tab: 'Answer' },
    { expect: 'Recommendation: hold until a Partner reviews.' },
    { expect: 'not privy to' },
  ],
  inspector: [
    { tab: 'Inspector' },
    { expect: 'stage key' },
    { expect: 'contents hidden' },
  ],
  'role-switch': [
    { click: 'role-Partner' },
    { tab: 'Capture' },
    { expect: 'Conflicts memo' },
  ],
  release: [
    { tab: 'Brief' },
    { clickPrefix: 'release-' },
    { expect: 'Shared with the firm' },
  ],
  approve: [
    { click: 'role-Partner' },
    { tab: 'Answer' },
    { clickPrefix: 'approve-' },
    { expect: 'Approved by Partner' },
  ],
};

function args() {
  const out = { _: [] };
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].startsWith('--')) out[raw[i].slice(2)] = raw[i + 1] ?? '';
    else if (i === 0 || !raw[i - 1].startsWith('--')) out._.push(raw[i]);
  }
  return out;
}

async function tab(page, name) {
  await page.getByTestId('tab-' + name).click();
}

async function run() {
  const argv = args();
  const action = argv._[0];
  const flowName = argv.flow ?? argv._[1];
  const evidence = argv.evidence;
  const url = argv.url ?? 'http://localhost:5173';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const failures = [];
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('run-pipeline').waitFor({ timeout: 15000 });
    if (action === 'snapshot') {
      if (argv.tab) await tab(page, argv.tab);
      await page.waitForTimeout(2000);
      await page.screenshot({ path: join(evidence, 'snapshot.png'), fullPage: true });
      writeFileSync(join(evidence, 'snapshot.html'), await page.content());
      console.log('snapshot: ' + (await page.getByTestId('error').count() === 0 ? 'no page errors' : 'PAGE SHOWS AN ERROR'));
    } else if (action === 'run') {
      const steps = FLOWS[flowName];
      if (!steps) {
        console.error('unknown flow: ' + flowName);
        process.exit(2);
      }
      for (const step of steps) {
        try {
          if (step.tab) await tab(page, step.tab);
          if (step.click) await page.getByTestId(step.click).click();
          if (step.clickPrefix) await page.locator(`[data-testid^="${step.clickPrefix}"]`).first().click();
          if (step.expect) await page.getByText(step.expect, { exact: false }).first().waitFor({ timeout: 15000 });
        } catch (e) {
          failures.push(JSON.stringify(step) + ' :: ' + String(e).split('\n')[0]);
          break;
        }
      }
      await page.screenshot({ path: join(evidence, 'run-' + flowName + '.png'), fullPage: true });
      if (failures.length > 0) {
        console.error('FAIL ' + flowName + ': ' + failures[0]);
        process.exit(1);
      }
      console.log('PASS ' + flowName);
    } else {
      console.error('usage: browser.mjs snapshot|run [--flow F] [--tab T] --evidence DIR [--url URL]');
      process.exit(2);
    }
  } finally {
    await browser.close();
  }
}

run();
