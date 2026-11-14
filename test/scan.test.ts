// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contextText, scanPage, scanRedacted } from "../src/lens/scan";
import { parseNotes, unknownCitations } from "../src/lens/prompts";

function loadDemo(): Document {
  const html = readFileSync(resolve(process.cwd(), "demo/withdraw.html"), "utf8");
  const doc = document.implementation.createHTMLDocument("t");
  doc.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");
  return doc;
}

describe("scanPage", () => {
  it("finds every form field with its Chinese label", () => {
    const ctx = scanPage(loadDemo());
    expect(ctx.fields.map((f) => f.key)).toEqual(["course", "reasonType", "reason", "scholar", "phone", "ack"]);
    expect(ctx.fields.find((f) => f.key === "reasonType")!.labelZh).toBe("停修原因");
    expect(ctx.notices).toHaveLength(5);
  });

  it("collects the personal values on the page", () => {
    const ctx = scanPage(loadDemo());
    expect(ctx.personal).toEqual(expect.arrayContaining(["B11203047", "阮氏蘭", "12", "0912-345-678"]));
  });
});

describe("redact", () => {
  it("leaves no personal value anywhere in the text that may go to the cloud", () => {
    const doc = loadDemo();
    const full = scanPage(doc);
    const text = contextText(scanRedacted(doc));
    for (const secret of ["B11203047", "阮氏蘭", "0912-345-678"]) expect(text).not.toContain(secret);
    expect(contextText(full)).toContain("0912-345-678");
  });

  it("still keeps the labels and rules the cloud needs", () => {
    const text = contextText(scanRedacted(loadDemo()));
    expect(text).toContain("停修原因");
    expect(text).toContain("第12週");
    expect(text).not.toMatch(/總學分 \| 12/);
  });
});

describe("model output guards", () => {
  it("drops notes for unknown fields and rule ids that do not exist", () => {
    const notes = parseNotes(JSON.stringify({ notes: [
      { key: "reason", note: "Free text.", rules: ["R19", "R99"] },
      { key: "made-up", note: "x", rules: [] },
    ] }), ["reason"]);
    expect(notes).toEqual([{ key: "reason", note: "Free text.", rules: ["R19"] }]);
  });

  it("reads the markdown list the on-device model sometimes returns instead of JSON", () => {
    const raw = "Here are the notes:\n\n- **course**:  Select the course. (rules: R16)\n- **phone**: Contact number. (rules: R13)\n- **nope**: x";
    expect(parseNotes(raw, ["course", "phone"])).toEqual([
      { key: "course", note: "Select the course.", rules: ["R16"] },
      { key: "phone", note: "Contact number.", rules: ["R13"] },
    ]);
  });

  it("flags citations that are not in the knowledge base", () => {
    expect(unknownCitations("See [R12] and [R40].")).toEqual(["R40"]);
  });
});
