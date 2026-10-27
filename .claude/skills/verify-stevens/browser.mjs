import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PERSONAL = 'http://localhost:5173';
const FIRM = 'http://localhost:5174/?as=p-morgan';

const FLOWS = {
  'associate-today': [
    { expectTestId: 'meeting-card' },
    { expect: 'Helios' },
    { expect: 'The deck says' },
    { expect: 'You heard' },
    { expect: 'Ask about Helios' },
    { expectTestId: 'bridge' },
  ],
  'associate-ask': [
    { expectTestId: 'meeting-card' },
    { fill: 'ask-input', with: 'Should we take the second meeting?' },
    { click: 'ask-send' },
    { expect: 'Hold' },
    { expect: 'nothing enclosed' },
    { expectTestId: 'answer' },
  ],
  'partner-inbox': [
    { expectTestId: 'inbox' },
    { expect: 'asked about Helios' },
    { expect: "Enclosed from" },
  ],
  'partner-approve': [
    { expectTestId: 'decision' },
    { click: 'approve' },
    { expect: 'Approved by Morgan Hale' },
  ],
  'partner-sources': [
    { click: 'nav-sources' },
    { expectTestId: 'sources' },
    { expect: 'Where the firm reads from' },
    { expect: 'SEC Form D' },
  ],
  'demo-two-screens': [
    { url: PERSONAL + '/#/today' },
    { expect: 'The deck says' },
    { url: FIRM + '#/inbox' },
    { expect: 'asked about Helios' },
  ],
  'associate-share': [
    { expectTestId: 'meeting-card' },
    { click: 'share-button' },
    { expectTestId: 'share-sheet' },
    { expect: 'Exactly this crosses' },
    { click: 'share-confirm' },
    { expect: 'Shared with the firm' },
  ],
  'associate-receipts': [
    { expectTestId: 'meeting-card' },
    { click: 'receipts-button' },
    { expectTestId: 'receipts' },
    { expect: 'What Stevens used' },
    { expect: 'Went in' },
  ],
  'associate-captures': [
    { click: 'nav-captures' },
    { expect: 'Speaker 1' },
    { expect: 'Glasses inbox' },
  ],
};

const BANNED_WORDS = ['pipeline', 'stage', 'ledger', 'manifest', 'vault'];
const BANNED_CONTROLS = ['Run pipeline', 'Run ', 'Ingest', 'Extract', 'Bridge', 'Brief'];

function args() {
  const out = { _: [] };
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].startsWith('--')) {
      const key = raw[i].slice(2);
      const next = raw[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = '';
      }
    } else if (i === 0 || !raw[i - 1].startsWith('--')) out._.push(raw[i]);
  }
  return out;
}

async function vocabCheck(page, flowName) {
  const receiptsOpen = await page.getByTestId('receipts').count();
  if (receiptsOpen > 0) return null;
  const text = await page.getByTestId('meeting-card').count() > 0 || flowName.includes('today') || flowName.includes('ask') || flowName.includes('share')
    ? await page.content()
    : await page.content();
  const lower = text.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (word === 'stage' && lower.includes('stage')) {
      if (!lower.includes('receipts')) return 'banned word "' + word + '" in product UI';
    } else if (lower.includes(word) && word !== 'stage') {
      if (word === 'claim' && lower.includes('claim')) return 'banned word "claim" in product UI';
      if (word !== 'claim') return 'banned word "' + word + '" in product UI';
    }
  }
  if (lower.includes('claim') && !lower.includes('receipts')) {
    const body = await page.locator('main').innerText().catch(() => '');
    if (body.toLowerCase().includes('claim')) return 'banned word "claim" in product UI';
  }
  const runPipeline = await page.getByTestId('run-pipeline').count();
  if (runPipeline > 0) return 'Run control present in product UI';
  return null;
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
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });
  page.on('pageerror', (err) => consoleErrors.push(String(err).slice(0, 200)));
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    if (action === 'snapshot') {
      await page.waitForTimeout(2000);
      await page.screenshot({ path: join(evidence, 'snapshot.png'), fullPage: true });
      writeFileSync(join(evidence, 'snapshot.html'), await page.content());
      console.log('snapshot done');
      console.log('console errors: ' + consoleErrors.length);
      for (const err of consoleErrors.slice(0, 5)) console.log('  ' + err);
    } else if (action === 'run') {
      const steps = FLOWS[flowName];
      if (!steps) {
        console.error('unknown flow: ' + flowName);
        process.exit(2);
      }
      for (const step of steps) {
        try {
          if (step.url) {
            await page.goto(step.url, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(5000);
          }
          if (step.click) await page.getByTestId(step.click).first().click();
          if (step.clickPrefix) await page.locator(`[data-testid^="${step.clickPrefix}"]`).first().click();
          if (step.fill) await page.getByTestId(step.fill).first().fill(step.with);
          if (step.expectTestId) await page.getByTestId(step.expectTestId).first().waitFor({ timeout: 20000 });
          if (step.expect) await page.getByText(step.expect, { exact: false }).first().waitFor({ timeout: 20000 });
        } catch (e) {
          failures.push(JSON.stringify(step) + ' :: ' + String(e).split('\n')[0]);
          break;
        }
      }
      if (failures.length === 0) {
        const vocab = await vocabCheck(page, flowName);
        if (vocab) failures.push('vocab :: ' + vocab);
      }
      await page.screenshot({ path: join(evidence, 'run-' + flowName + '.png'), fullPage: true });
      writeFileSync(join(evidence, 'run-' + flowName + '.html'), await page.content());
      if (failures.length > 0) {
        console.error('FAIL ' + flowName + ': ' + failures[0]);
        process.exit(1);
      }
      console.log('PASS ' + flowName);
    } else {
      console.error('usage: browser.mjs snapshot|run [--flow F] --evidence DIR [--url URL]');
      process.exit(2);
    }
  } finally {
    await browser.close();
  }
}

run();
