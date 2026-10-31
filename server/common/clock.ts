export function nowIso(): string {
  return process.env.STEVENS_NOW ?? new Date().toISOString();
}

export function nowMs(): number {
  return Date.parse(nowIso());
}

export function assertValidNow(raw: string | undefined): void {
  if (raw === undefined || raw === '') return;
  if (Number.isNaN(Date.parse(raw))) throw new Error('STEVENS_NOW=' + raw + ' is not a valid ISO timestamp');
}
