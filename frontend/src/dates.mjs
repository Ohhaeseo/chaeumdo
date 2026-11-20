export function inclusiveDays(start, end) {
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(first) && Number.isFinite(last) && last >= first ? Math.round((last - first) / 86400000) + 1 : 0;
}

// "M/D" of the day `offset` days after start, for DAY headings.
export function dayDate(start, offset) {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

// "당일치기" for one day, otherwise "N박 N+1일".
export function stayLabel(days) {
  return days === 1 ? "당일치기" : `${days - 1}박 ${days}일`;
}

export function dateRange(start, end) {
  return `${start.replaceAll("-", ".")} ~ ${end.replaceAll("-", ".")}`;
}
