/**
 * Builds the English rule base from a school's Chinese regulations, in the cloud.
 *
 * This is the "heavy, public, once" half of the hybrid design: the regulations are public text,
 * long and in Chinese, which the small on-device model handles poorly. The cloud model turns them
 * into short English rules once; every student then answers from those rules on their own device.
 *
 * The model is not trusted with the parts that must be exact:
 * - rule ids come from the article number (第二十一條 → R21), set by code;
 * - every rule must quote its Chinese source, and the quote must appear in the regulations;
 * - every number in the English text must also be in the quoted source (Chinese numerals included).
 */

import { Schema } from "firebase/ai";

export interface KbRule {
  id: string;
  zh: string;
  title: string;
  text: string;
  source: string;
}

export interface Checked {
  rule: KbRule;
  problems: string[];
}

export const kbSchema = Schema.object({
  properties: {
    rules: Schema.array({
      items: Schema.object({
        properties: {
          article: Schema.string(),
          zh: Schema.string(),
          title: Schema.string(),
          text: Schema.string(),
          source: Schema.string(),
        },
      }),
    }),
  },
});

export function kbPrompt(regulations: string): string {
  return `Below are a Taiwanese university's regulations in Chinese. Turn every article (第…條) into one rule for international students who read only English.

For each article return:
- "article": the article heading exactly as written, e.g. 第二十一條
- "zh": the 2–6 character Chinese term a student will see on the admin page (e.g. 停修, 二一, 學分費)
- "title": a short English title
- "text": the rule in plain English, 1–3 sentences. Keep every number, limit and deadline from the article. Add nothing that is not in the article.
- "source": the article's Chinese text, copied exactly, without the heading

Return JSON: {"rules":[...]}.

REGULATIONS
${regulations}`;
}

const DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 一 → 1, 十二 → 12, 二十一 → 21, 九十九 → 99. Returns NaN for anything else. */
export function cnNumber(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  if (s === "十") return 10;
  const m = s.match(/^([一二兩三四五六七八九])?十([一二三四五六七八九])?$/);
  if (m) return (m[1] ? DIGIT[m[1]]! : 1) * 10 + (m[2] ? DIGIT[m[2]]! : 0);
  if (s.length === 1 && s in DIGIT) return DIGIT[s]!;
  return NaN;
}

/** Article heading → rule id. 第二十一條 → R21. */
export function ruleId(article: string): string | null {
  const m = article.match(/第([一二三四五六七八九十\d]+)條/);
  if (!m) return null;
  const n = cnNumber(m[1]!);
  return Number.isFinite(n) ? `R${n}` : null;
}

/** All numbers a Chinese passage states, as Arabic numerals, including clock times (下午五時 → 5 and 17). */
export function numbersInChinese(s: string): Set<number> {
  const out = new Set<number>();
  for (const m of s.matchAll(/\d+/g)) out.add(Number(m[0]));
  for (const m of s.matchAll(/[一二兩三四五六七八九十]+/g)) {
    const n = cnNumber(m[0]);
    if (Number.isFinite(n)) out.add(n);
    // 三至五 / 二科 style runs are also single digits next to each other.
    for (const ch of m[0]) if (ch in DIGIT) out.add(DIGIT[ch]!);
  }
  for (const m of s.matchAll(/下午([一二三四五六七八九十]+)時/g)) {
    const n = cnNumber(m[1]!);
    if (Number.isFinite(n)) out.add(n + 12);
  }
  if (/二分之一/.test(s)) out.add(2);
  return out;
}

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, twentieth: 20,
  half: 2,
};

/**
 * Numbers an English rule states, as digits or as words ("twelfth week", "nine credits").
 * "17:00" counts as 17; "5:00 PM" counts as 5 and 17.
 */
export function numbersInEnglish(text: string): number[] {
  const out: number[] = [];
  const t = text.toLowerCase();
  for (const m of t.matchAll(/(\d{1,2}):\d{2}\s*(am|pm|a\.m\.|p\.m\.)?/g)) {
    const h = Number(m[1]);
    out.push(h);
    if (m[2]?.startsWith("p") && h < 12) out.push(h + 12);
  }
  const rest = t.replace(/(\d{1,2}):\d{2}/g, " ");
  for (const m of rest.matchAll(/\d+/g)) out.push(Number(m[0]));
  for (const m of rest.matchAll(/\b[a-z]+\b/g)) if (m[0] in WORDS) out.push(WORDS[m[0]]!);
  return out;
}

const squash = (s: string) => s.replace(/\s+/g, "");

/** Checks one model-written rule against the regulations. Empty problems = accepted. */
export function check(raw: { article?: string; zh?: string; title?: string; text?: string; source?: string }, regulations: string): Checked {
  const problems: string[] = [];
  const id = ruleId(raw.article ?? "");
  if (!id) problems.push(`No article number in "${raw.article ?? ""}".`);
  const source = (raw.source ?? "").trim();
  if (!source) problems.push("No Chinese source quoted.");
  else if (!squash(regulations).includes(squash(source))) problems.push("The quoted source is not in the regulations.");
  const text = (raw.text ?? "").trim();
  if (!text) problems.push("No English text.");
  const known = numbersInChinese(source);
  for (const n of numbersInEnglish(text)) {
    if (!known.has(n)) problems.push(`The number ${n} is not in the quoted source.`);
  }
  return {
    rule: { id: id ?? "?", zh: (raw.zh ?? "").trim(), title: (raw.title ?? "").trim(), text, source },
    problems,
  };
}

export function parseKb(json: string, regulations: string): Checked[] {
  const m = json.match(/\{[\s\S]*\}/);
  const data = m ? (JSON.parse(m[0]) as { rules?: unknown[] }) : { rules: [] };
  return (data.rules ?? []).map((r) => check(r as Parameters<typeof check>[0], regulations));
}
