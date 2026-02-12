export function fmtDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export function fmtPercent(value) {
  if (value === null || value === undefined) return "0.00%";
  return `${Number(value).toFixed(2)}%`;
}

export function fmtInt(value) {
  if (value === null || value === undefined) return "0";
  return Number(value).toLocaleString();
}
