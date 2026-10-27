export function nowIso(): string {
  return process.env.STEVENS_NOW ?? new Date().toISOString();
}

export function nowMs(): number {
  return Date.parse(nowIso());
}
