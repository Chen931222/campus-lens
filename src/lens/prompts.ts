import { Schema } from "firebase/ai";
import kb from "../kb/yunshan.json";

export interface Note {
  key: string;
  note: string;
  rules: string[];
}

export const rulesText = kb.rules.map((r) => `[${r.id}] ${r.title} (${r.zh}): ${r.text}`).join("\n");
export const ruleIds = new Set(kb.rules.map((r) => r.id));

export const notesSchema = Schema.object({
  properties: {
    notes: Schema.array({
      items: Schema.object({
        properties: {
          key: Schema.string(),
          note: Schema.string(),
          rules: Schema.array({ items: Schema.string() }),
        },
      }),
    }),
  },
});

const fieldRules = ((kb as unknown as { fieldRules?: Record<string, unknown> }).fieldRules ?? {}) as Record<string, string[] | undefined>;
const ruleText = new Map(kb.rules.map((r) => [r.id, `[${r.id}] ${r.title}: ${r.text}`]));

/** The rules a field is about, chosen by hand per field, so the model is not left to guess. */
export function rulesForField(key: string): string[] {
  const ids = fieldRules[key];
  return Array.isArray(ids) ? ids.filter((id) => ruleText.has(id)) : [];
}

export function notesPrompt(page: string, fieldKeys: string[]): string {
  const perField = fieldKeys
    .map((k) => {
      const ids = rulesForField(k);
      return `FIELD ${k}\n${ids.length ? ids.map((id) => ruleText.get(id)).join("\n") : "(no school rule; say only what to enter)"}`;
    })
    .join("\n\n");
  return `You write margin notes for an international student who cannot read Chinese, on a Taiwanese university admin page.
For each FIELD below write one note in plain English, at most 25 words.
- First say what the field is in a few words.
- Then the single most important fact from that field's rules: a limit, a deadline, a consequence, or who reads it.
- If the field has no rule, say only what to enter, in at most 10 words. Do not pad.
- Use only the rules given under that field. No other numbers. Never mention page numbers.
Answer as JSON: {"notes":[{"key":"<field key>","note":"...","rules":["R.."]}]}

${perField}

PAGE (for context)
${page}`;
}

/**
 * With a computed verdict, the decision and its reasons are already on screen, typeset by code.
 * The model only writes what to do next, so it cannot restate a passing check as a reason.
 */
export function askPrompt(page: string, question: string, verdict?: string): string {
  if (verdict) {
    return `An international student asked about a Taiwanese university admin page. The app has already checked the request against the course table and shown this to the student:

${verdict}

Do not repeat the decision or the reasons. Write only what the student should do next, as 2 or 3 short steps in plain English (max 60 words total), using the school rules below. Cite rule ids in square brackets like [R15]. ${"If the decision is NOT ALLOWED, suggest what they could do instead (for example withdraw fewer courses) only if the rules allow it."} Never mention page numbers.

SCHOOL RULES
${rulesText}

QUESTION
${question}`;
  }
  return `You help an international student understand a Taiwanese university admin page.
Answer in plain English, under 90 words. Use only the school rules and the page below. Cite rule ids in square brackets like [R12]. If the answer depends on something not shown, say what to check and with whom. If it is not covered, say "Not in the rules I have" and suggest the office to ask. Never mention page numbers.

SCHOOL RULES
${rulesText}

PAGE
${page}

QUESTION
${question}`;
}

/** True when the model's opening contradicts the app's decision (e.g. "Yes" on NOT ALLOWED). */
export function contradicts(answer: string, allowed: boolean): boolean {
  const head = answer.trim().slice(0, 40).toLowerCase();
  const yes = /^(yes|you can|you may|sure)\b/.test(head);
  const no = /^(no|you cannot|you can't|you may not|not allowed)\b/.test(head);
  return allowed ? no : yes;
}

/** Keeps only notes for known fields and only rule ids that exist. */
export function parseNotes(text: string, keys: string[]): Note[] {
  const list = readJsonNotes(text) ?? readListNotes(text);
  const known = new Set(keys);
  const out: Note[] = [];
  for (const item of list) {
    const n = item as Partial<Note>;
    if (!n.key || !known.has(n.key) || typeof n.note !== "string") continue;
    out.push({ key: n.key, note: n.note.trim(), rules: (n.rules ?? []).filter((r) => ruleIds.has(r)) });
  }
  return out;
}

/** Rule ids cited in an answer that do not exist in the knowledge base. */
export function unknownCitations(answer: string): string[] {
  return [...answer.matchAll(/\[(R\d+)\]/g)].map((m) => m[1]!).filter((id) => !ruleIds.has(id));
}

function readJsonNotes(text: string): unknown[] | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const data = JSON.parse(m[0]) as { notes?: unknown[] };
    return Array.isArray(data.notes) ? data.notes : null;
  } catch {
    return null;
  }
}

/**
 * The on-device model sometimes ignores the JSON schema and answers as a markdown list:
 * "- **reason**: Briefly explain why. (rules: R19)". Read that shape too.
 */
function readListNotes(text: string): Partial<Note>[] {
  const out: Partial<Note>[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*\d.]+\s*\**`?([A-Za-z][\w-]*)`?\**\s*[:：]\s*(.+)$/);
    if (!m) continue;
    let note = m[2]!.trim();
    const rules: string[] = [];
    note = note.replace(/\s*\((?:rules?|rule ids?)\s*:?\s*([^)]*)\)\s*$/i, (_, ids: string) => {
      rules.push(...(ids.match(/R\d+/g) ?? []));
      return "";
    });
    note = note.replace(/\[(R\d+)\]/g, (_, id: string) => {
      rules.push(id);
      return "";
    }).trim();
    note = note.replace(/^[*\s]+/, "").replace(/\s*\((?:table-choice|select|text|radio|checkbox)\)\s*$/i, "").trim();
    out.push({ key: m[1], note, rules });
  }
  return out;
}
