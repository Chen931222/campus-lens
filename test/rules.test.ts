// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import fc from "fast-check";
import { coursesInText, evaluate, LIMITS, readCourses, tickedCourses, verdictText, type Course } from "../src/lens/rules";

function loadDemo(): Document {
  const html = readFileSync(resolve(process.cwd(), "demo/withdraw.html"), "utf8");
  const doc = document.implementation.createHTMLDocument("t");
  doc.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");
  return doc;
}

describe("the question the model got wrong", () => {
  const doc = loadDemo();
  const courses = readCourses(doc);

  it("reads the five courses and 12 credits from the table", () => {
    expect(courses.map((c) => c.code)).toEqual(["CS2031", "CS2105", "GE1120", "LA1003", "PE2001"]);
    expect(courses.reduce((s, c) => s + c.credits, 0)).toBe(12);
  });

  it("finds both courses named in Chinese in the question", () => {
    const picked = coursesInText(courses, "I have 12 credits. Can I drop 資料結構 and 計算機組織?");
    expect(picked.map((c) => c.code)).toEqual(["CS2031", "CS2105"]);
  });

  it("says NOT allowed: 12 → 6 is below 9", () => {
    const v = evaluate(courses, coursesInText(courses, "drop 資料結構 and 計算機組織"));
    expect(v.allowed).toBe(false);
    expect(v.after).toBe(6);
    expect(v.findings.find((f) => f.rule === "R22")!.ok).toBe(false);
    expect(verdictText(v, false)).toContain("Decision: NOT ALLOWED");
  });

  it("allows dropping one 3-credit course (12 → 9) but warns it is required", () => {
    const v = evaluate(courses, coursesInText(courses, "CS2031"));
    expect(v.allowed).toBe(true);
    expect(v.findings.map((f) => f.rule)).toContain("R24");
  });

  it("reads ticked boxes", () => {
    (doc.querySelector('input[value="GE1120"]') as HTMLInputElement).checked = true;
    expect(tickedCourses(courses, doc).map((c) => c.code)).toEqual(["GE1120"]);
  });
});

describe("evaluate, for any course list", () => {
  const course = fc.record({
    code: fc.stringMatching(/^[A-Z]{2}\d{4}$/),
    name: fc.string({ minLength: 1, maxLength: 6 }),
    credits: fc.integer({ min: 0, max: 4 }),
    required: fc.boolean(),
  });

  it("allowed exactly when ≤ 2 courses and ≥ 9 credits remain", () => {
    fc.assert(
      fc.property(fc.array(course, { maxLength: 8 }), fc.array(fc.nat(), { maxLength: 4 }), (courses: Course[], picks) => {
        const selected = [...new Set(picks.map((i) => (courses.length ? courses[i % courses.length]! : null)).filter(Boolean))] as Course[];
        const v = evaluate(courses, selected);
        const after = courses.reduce((s, c) => s + c.credits, 0) - selected.reduce((s, c) => s + c.credits, 0);
        expect(v.after).toBe(after);
        expect(v.allowed).toBe(selected.length <= LIMITS.maxCourses && after >= LIMITS.minCreditsUndergrad);
      }),
    );
  });

  it("the cloud-safe text never contains the credit totals", () => {
    fc.assert(
      fc.property(fc.array(course, { minLength: 1, maxLength: 8 }), (courses: Course[]) => {
        const v = evaluate(courses, courses.slice(0, 1));
        const safe = v.findings.map((f) => f.safeText).join(" ");
        expect(safe).not.toContain(`${v.before} →`);
        expect(safe).not.toContain(`→ ${v.after}`);
      }),
    );
  });
});
