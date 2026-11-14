/**
 * Removes sentences the model could not have taken from its sources.
 *
 * Seen on the device model: the page header says "115學年度" (academic year 115) and the answer
 * told the student to "follow the steps on page 115". Every number the student reads must come
 * from the rules, the page or the app's own check, and references to pages, sections or articles
 * that do not exist are dropped outright.
 */

export interface Grounded {
  text: string;
  removed: string[];
}

/** Splits into sentences, keeping bullet lines as their own units. */
export function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

function numbersIn(s: string): string[] {
  return s.match(/\d+(?:\.\d+)?/g) ?? [];
}

/** References the sources never contain in this form. */
const INVENTED_REFERENCE = /\b(?:page|p\.|section|article|chapter|paragraph|form)\s*#?\d+/i;

/** Rule ids written inside any brackets: [R12], [R12, R4], (R13). */
function citedIds(s: string): string[] {
  return [...s.matchAll(/[[(]([^\])]*R\d+[^\])]*)[\])]/g)].flatMap((m) => m[1]!.match(/R\d+/g) ?? []);
}

/** Strips markdown the panel does not render (bold, headings, numeric footnotes like [1]). */
export function plain(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/^#+\s*/gm, "").replace(/\s*\[\d+\]/g, "");
}

export function ground(answer: string, sources: string): Grounded {
  const known = new Set(numbersIn(sources));
  const knownIds = new Set(citedIds(sources));
  const kept: string[] = [];
  const removed: string[] = [];
  for (const s of sentences(plain(answer))) {
    const ids = citedIds(s);
    const cleaned = s.replace(/[[(][^\])]*R\d+[^\])]*[\])]/g, "");
    const unknown = numbersIn(cleaned).filter((n) => !known.has(n));
    const badId = ids.some((id) => !knownIds.has(id));
    if (unknown.length || badId || (INVENTED_REFERENCE.test(cleaned) && !INVENTED_REFERENCE.test(sources))) removed.push(s);
    else kept.push(s);
  }
  return { text: kept.join(" "), removed };
}
