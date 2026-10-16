/**
 * Display formatting. Pure and locale-stable (en-GB style dates: "3 Mar 2026")
 * so server and client render identical text and hydration never mismatches.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(value: string | Date): Date | null {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "3 Mar 2026" (UTC, so it never shifts between server and browser). */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = toDate(value);
  if (!date) return "";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "Mar 2026" — for publication dates where the day adds little. */
export function formatMonthYear(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = toDate(value);
  if (!date) return "";
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * Quiet relative dates: "Today", "Yesterday", "4 days ago", "3 weeks ago",
 * then a plain date once it's more than ~2 months back.
 */
export function formatRelativeDate(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "";
  const date = toDate(value);
  if (!date) return "";
  const startOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  return formatDate(date);
}

/** "How long ago", in words, for Rediscover: "14 months", "2 years". */
export function formatAge(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "";
  const date = toDate(value);
  if (!date) return "";
  const days = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
  if (days < 14) return days === 1 ? "1 day" : `${days} days`;
  if (days < 60) return `${Math.floor(days / 7)} weeks`;
  // Calendar months, so 15 Apr → 15 Jun of the next year reads "14 months".
  const months =
    (now.getUTCFullYear() - date.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - date.getUTCMonth()) -
    (now.getUTCDate() < date.getUTCDate() ? 1 : 0);
  if (months < 24) return `${Math.max(months, 2)} months`;
  return `${Math.floor(months / 12)} years`;
}

export function formatReadingTime(minutes: number | null | undefined): string {
  if (!minutes || minutes < 1) return "";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}

/** The title to show for a link: its own, or the domain while we wait for one. */
export function displayTitle(link: { title: string | null; domain: string; url: string }): string {
  return link.title?.trim() || link.domain || link.url;
}

/** The source line for a link: the site's own name when it has one, else the domain. */
export function displaySource(link: { siteName: string | null; domain: string }): string {
  return link.siteName?.trim() || link.domain;
}

/** "YYYY-MM-DD" for date inputs, from an ISO timestamp. */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
}
