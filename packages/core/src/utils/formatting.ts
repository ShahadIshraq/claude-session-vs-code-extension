export function formatRelativeTime(timestampMs: number): string {
  const now = Date.now();
  const diffMs = timestampMs - now;
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (absMs < minute) {
    return "just now";
  }
  if (absMs < hour) {
    return rtf.format(Math.round(diffMs / minute), "minute");
  }
  if (absMs < day) {
    return rtf.format(Math.round(diffMs / hour), "hour");
  }
  if (absMs < week) {
    return rtf.format(Math.round(diffMs / day), "day");
  }
  if (absMs < month) {
    return rtf.format(Math.round(diffMs / week), "week");
  }
  if (absMs < year) {
    return rtf.format(Math.round(diffMs / month), "month");
  }
  return rtf.format(Math.round(diffMs / year), "year");
}

export function formatAgeToken(timestampMs: number): string {
  const now = Date.now();
  const diffMs = timestampMs - now;
  const absMs = Math.abs(diffMs);
  const isPast = diffMs <= 0;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (absMs < minute) {
    return "now";
  }

  let value: number;
  let unit: string;
  if (absMs < hour) {
    value = Math.round(absMs / minute);
    unit = "m";
  } else if (absMs < day) {
    value = Math.round(absMs / hour);
    unit = "h";
  } else if (absMs < week) {
    value = Math.round(absMs / day);
    unit = "d";
  } else if (absMs < month) {
    value = Math.round(absMs / week);
    unit = "w";
  } else if (absMs < year) {
    value = Math.round(absMs / month);
    unit = "mo";
  } else {
    value = Math.round(absMs / year);
    unit = "y";
  }

  return isPast ? `${value}${unit} ago` : `in ${value}${unit}`;
}

export function truncateForTreeLabel(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function findHighlightRanges(label: string, query: string): [number, number][] {
  if (query.length === 0) {
    return [];
  }
  const ranges: [number, number][] = [];
  const lowerLabel = label.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let startIndex = 0;
  while (startIndex < lowerLabel.length) {
    const idx = lowerLabel.indexOf(lowerQuery, startIndex);
    if (idx === -1) {
      break;
    }
    ranges.push([idx, idx + lowerQuery.length]);
    startIndex = idx + lowerQuery.length;
  }
  return ranges;
}
