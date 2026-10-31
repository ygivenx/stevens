function offsetMsOf(raw: string): number {
  if (/[zZ]$/.test(raw)) return 0;
  const found = /([+-])(\d{2}):?(\d{2})$/.exec(raw);
  if (!found) return 0;
  const minutes = Number(found[2]) * 60 + Number(found[3]);
  return (found[1] === '+' ? 1 : -1) * minutes * 60000;
}

export function anchorStartsAt(startsAts: string[], nowMs: number): string[] {
  if (startsAts.length === 0) return [];
  const parsed = startsAts.map((raw) => {
    const ms = Date.parse(raw);
    if (Number.isNaN(ms)) throw new Error('cannot anchor invalid timestamp ' + raw);
    return ms;
  });
  const earliest = Math.min(...parsed);
  const offset = offsetMsOf(startsAts[parsed.indexOf(earliest)]);
  const earliestWall = new Date(earliest + offset);
  const earliestDay = Date.UTC(earliestWall.getUTCFullYear(), earliestWall.getUTCMonth(), earliestWall.getUTCDate());
  const timeOfDay = earliest + offset - earliestDay;
  const frameNow = new Date(nowMs + 30 * 60000 + offset);
  const dayStart = Date.UTC(frameNow.getUTCFullYear(), frameNow.getUTCMonth(), frameNow.getUTCDate());
  let candidate = dayStart + timeOfDay - offset;
  if (candidate <= nowMs + 30 * 60000) candidate += 86400000;
  if (candidate > nowMs + 86400000) candidate -= 86400000;
  const delta = candidate - earliest;
  return parsed.map((ms) => new Date(ms + delta).toISOString());
}
