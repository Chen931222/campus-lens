/**
 * Number rules are checked by code, not by the model.
 *
 * Asked "I have 12 credits, can I drop two 3-credit courses?", the on-device model answered
 * "Yes, you can" and then, one sentence later, that it would put the student below the minimum.
 * Arithmetic and limits are exactly what a small model gets wrong, so the app computes them and
 * hands the model a verdict it must explain, not decide.
 */

export interface Course {
  code: string;
  name: string;
  credits: number;
  required: boolean;
}

export interface Finding {
  rule: string;
  ok: boolean;
  /** Full sentence with numbers. Stays on the device. */
  text: string;
  /** Same finding without the student's numbers, safe for the cloud. */
  safeText: string;
}

export interface Verdict {
  selected: Course[];
  before: number;
  after: number;
  allowed: boolean;
  findings: Finding[];
}

export const LIMITS = { maxCourses: 2, minCreditsUndergrad: 9 } as const;

/** Reads the course table: code | name | credits | 必/選 | teacher. */
export function readCourses(doc: Document = document): Course[] {
  const out: Course[] = [];
  for (const tr of doc.querySelectorAll(".courses tbody tr")) {
    const cells = [...tr.children].map((c) => (c.textContent ?? "").trim());
    const [, code, name, credits, kind] = cells;
    const n = Number(credits);
    if (!code || !name || !Number.isFinite(n)) continue;
    out.push({ code, name, credits: n, required: kind === "必" });
  }
  return out;
}

/** Courses the student ticked in the table. */
export function tickedCourses(courses: Course[], doc: Document = document): Course[] {
  const codes = new Set([...doc.querySelectorAll<HTMLInputElement>('.courses input[name="course"]:checked')].map((i) => i.value));
  return courses.filter((c) => codes.has(c.code));
}

/** Courses named in a free-text question, by code or by Chinese name. */
export function coursesInText(courses: Course[], text: string): Course[] {
  const t = text.toUpperCase();
  return courses.filter((c) => t.includes(c.code.toUpperCase()) || text.includes(c.name) || text.includes(c.name.replace(/^通識：|^體育：/, "")));
}

export function evaluate(courses: Course[], selected: Course[]): Verdict {
  const before = courses.reduce((s, c) => s + c.credits, 0);
  const dropped = selected.reduce((s, c) => s + c.credits, 0);
  const after = before - dropped;
  const findings: Finding[] = [];

  const countOk = selected.length <= LIMITS.maxCourses;
  findings.push({
    rule: "R21",
    ok: countOk,
    text: countOk
      ? `${selected.length} course${selected.length === 1 ? "" : "s"} selected; the limit is ${LIMITS.maxCourses} per semester.`
      : `${selected.length} courses selected; the limit is ${LIMITS.maxCourses} per semester.`,
    safeText: countOk ? `Within the ${LIMITS.maxCourses}-course limit.` : `Over the ${LIMITS.maxCourses}-course limit.`,
  });

  const creditsOk = after >= LIMITS.minCreditsUndergrad;
  findings.push({
    rule: "R22",
    ok: creditsOk,
    text: creditsOk
      ? `${before} → ${after} credits, at or above the ${LIMITS.minCreditsUndergrad}-credit minimum.`
      : `${before} → ${after} credits, below the ${LIMITS.minCreditsUndergrad}-credit minimum. Not allowed.`,
    safeText: creditsOk
      ? `Stays at or above the ${LIMITS.minCreditsUndergrad}-credit minimum.`
      : `Would fall below the ${LIMITS.minCreditsUndergrad}-credit minimum. Not allowed.`,
  });

  const required = selected.filter((c) => c.required);
  if (required.length) {
    const list = required.map((c) => `${c.name} (${c.code})`).join(", ");
    findings.push({
      rule: "R24",
      ok: true,
      text: `${list} ${required.length === 1 ? "is a required course" : "are required courses"}: allowed, but you must retake ${required.length === 1 ? "it" : "them"} to graduate.`,
      safeText: `Includes a required course: allowed, but it must be retaken to graduate.`,
    });
  }

  return { selected, before, after, allowed: countOk && creditsOk, findings };
}

/** The verdict as text the model must explain and may not overturn. */
export function verdictText(v: Verdict, safe: boolean): string {
  const names = v.selected.map((c) => `${c.name} (${c.code}, ${c.credits} credits${c.required ? ", required" : ""})`).join("; ");
  return [
    `Courses in question: ${names}`,
    `Decision: ${v.allowed ? "ALLOWED" : "NOT ALLOWED"}`,
    ...v.findings.map((f) => `- ${f.ok ? "PASSES" : "FAILS"} [${f.rule}] ${safe ? f.safeText : f.text}`),
    v.allowed ? "Nothing fails." : "Only the FAILS lines are reasons it is not allowed. Do not give PASSES lines as reasons.",
  ].join("\n");
}

export interface Step {
  text: string;
  rules: string[];
}

/** Every smaller, non-empty part of the selection that would be allowed, largest first. */
export function allowedAlternatives(courses: Course[], selected: Course[]): Course[][] {
  const out: Course[][] = [];
  const n = selected.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const pick = selected.filter((_, i) => mask & (1 << i));
    if (pick.length === n) continue;
    if (evaluate(courses, pick).allowed) out.push(pick);
  }
  const credits = (cs: Course[]) => cs.reduce((s, c) => s + c.credits, 0);
  return out.sort((a, b) => b.length - a.length || credits(b) - credits(a));
}

const names = (cs: Course[]) => cs.map((c) => `${c.name} (${c.code})`).join(" and ");

/**
 * What to do next, assembled from the rules by code. Asked to write this, the device model twice
 * said two courses could not be dropped "because they are required"; the real reason is the credit
 * minimum. So these steps are not generated.
 */
export function nextSteps(courses: Course[], v: Verdict): Step[] {
  if (!v.allowed) {
    const alts = allowedAlternatives(courses, v.selected).slice(0, 3);
    if (!alts.length) {
      return [{ text: "None of these can be withdrawn without breaking a limit. Ask the department office (系辦) what you can do.", rules: ["R22"] }];
    }
    return [
      { text: `You could withdraw ${alts.map(names).join(", or ")} instead.`, rules: ["R21", "R22"] },
      { text: "Tick the courses you choose in the table to check again before you submit.", rules: [] },
    ];
  }
  const steps: Step[] = [
    { text: "Apply in the course system under 停修申請 before the end of week 12.", rules: ["R21"] },
    { text: "The course instructor and then your advisor (導師) approve it, usually in 3 to 5 working days. If the instructor has not answered near the deadline, contact the department office (系辦).", rules: ["R23"] },
  ];
  const required = v.selected.filter((c) => c.required);
  if (required.length) steps.push({ text: `You will have to retake ${names(required)} to graduate. Ask the department office (系辦) whether it is offered next semester.`, rules: ["R24"] });
  steps.push({ text: "If you have a scholarship, ask the Office of International Affairs (OIA) before you submit.", rules: ["R27"] });
  steps.push({ text: "Once approved it cannot be undone, and fees are not refunded.", rules: ["R21", "R25"] });
  return steps;
}

/**
 * Whether a question asks if withdrawing is allowed, so the ticked courses should be checked.
 * "Do I get my fees back if I withdraw?" is about fees, not permission, and goes to the model.
 */
export function asksPermission(question: string): boolean {
  const q = question.toLowerCase();
  if (/\b(fee|fees|refund|money|deadline|when|how long|what is|what's|who)\b/.test(q)) return false;
  return /\b(can|could|may|allowed|ok|okay|possible|able)\b/.test(q) && /\b(drop|withdraw|quit|stop|these|this|them|it)\b/.test(q);
}
