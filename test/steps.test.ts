// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allowedAlternatives, evaluate, nextSteps, readCourses } from "../src/lens/rules";

function loadDemo(): Document {
  const html = readFileSync(resolve(process.cwd(), "demo/withdraw.html"), "utf8");
  const doc = document.implementation.createHTMLDocument("t");
  doc.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<link[^>]*>/g, "");
  return doc;
}

describe("next steps are built by code", () => {
  const courses = readCourses(loadDemo());
  const pick = (...codes: string[]) => courses.filter((c) => codes.includes(c.code));

  it("for two 3-credit required courses (12 → 6), suggests withdrawing just one, and never blames 'required'", () => {
    const v = evaluate(courses, pick("CS2031", "CS2105"));
    expect(allowedAlternatives(courses, v.selected).map((a) => a.map((c) => c.code))).toEqual([["CS2031"], ["CS2105"]]);
    const text = nextSteps(courses, v).map((s) => s.text).join(" ");
    expect(text).toContain("資料結構 (CS2031), or 計算機組織 (CS2105)");
    expect(text).not.toMatch(/because/i);
  });

  it("for an allowed request, lists submit, approval, scholarship and no-undo steps", () => {
    const steps = nextSteps(courses, evaluate(courses, pick("GE1120")));
    expect(steps.flatMap((s) => s.rules)).toEqual(expect.arrayContaining(["R21", "R23", "R27", "R25"]));
    expect(steps.some((s) => s.rules.includes("R24"))).toBe(false);
  });

  it("every suggested alternative is itself allowed", () => {
    for (const sel of [pick("CS2031", "CS2105"), pick("GE1120", "LA1003", "PE2001"), pick("CS2031", "LA1003", "GE1120")]) {
      for (const alt of allowedAlternatives(courses, sel)) expect(evaluate(courses, alt).allowed).toBe(true);
    }
  });
});

import kb from "../src/kb/yunshan.json";

describe("rule ids used by code exist in the rule base", () => {
  const ids = new Set(kb.rules.map((r) => r.id));
  const courses = readCourses(loadDemo());
  it("every finding and step cites a real rule", () => {
    for (const codes of [["GE1120"], ["CS2031", "CS2105"], ["GE1120", "LA1003", "PE2001"], ["PE2001"]]) {
      const v = evaluate(courses, courses.filter((c) => codes.includes(c.code)));
      for (const id of [...v.findings.map((f) => f.rule), ...nextSteps(courses, v).flatMap((s) => s.rules)]) expect(ids.has(id)).toBe(true);
    }
  });
  it("every field's rules exist", () => {
    for (const [k, v] of Object.entries(kb.fieldRules)) if (Array.isArray(v)) for (const id of v) expect(ids.has(id), `${k}: ${id}`).toBe(true);
  });
});
