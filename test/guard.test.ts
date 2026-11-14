import { describe, expect, it } from "vitest";
import { ground, sentences } from "../src/lens/guard";
import { askPrompt, notesPrompt, rulesForField } from "../src/lens/prompts";

describe("ground", () => {
  const sources = "[R12] [R13] [R18] 115學年度 停修 ... until the end of week 12 ... at least 9 credits ... within 7 days";

  it("drops the invented 'page 115' sentence even though 115 is on the page", () => {
    const g = ground("You can withdraw GE1120 [R12]. To withdraw, follow the steps on page 115. Tell OIA within 7 days [R13].", sources + " GE1120");
    expect(g.removed).toEqual(["To withdraw, follow the steps on page 115."]);
    expect(g.text).toContain("within 7 days");
  });

  it("drops sentences with numbers the sources do not contain", () => {
    const g = ground("You must keep 9 credits. Approval takes 14 days.", sources);
    expect(g.removed).toEqual(["Approval takes 14 days."]);
  });

  it("ignores rule ids when checking numbers", () => {
    expect(ground("See [R18] before you decide.", sources).removed).toEqual([]);
  });

  it("drops a sentence citing a rule that does not exist, even inside a combined bracket", () => {
    const g = ground("No, you cannot undo it [R12, R4]. Fees are not refunded [R17].", "[R12] x [R17] y");
    expect(g.removed).toEqual(["No, you cannot undo it [R12, R4]."]);
    expect(g.text).toBe("Fees are not refunded [R17].");
  });

  it("strips markdown bold and numeric footnotes", () => {
    expect(ground("**Check with:** the office [1].", "office").text).toBe("Check with: the office.");
  });

  it("splits bullets and sentences", () => {
    expect(sentences("1. Ask OIA.\n2. Wait for approval. Then check.")).toEqual(["1.", "Ask OIA.", "2.", "Wait for approval.", "Then check."]);
  });
});

describe("prompts", () => {
  it("gives each field only its own rules", () => {
    expect(rulesForField("phone")).toEqual([]);
    expect(rulesForField("scholar")).toEqual(["R27"]);
    const p = notesPrompt("PAGE", ["phone", "scholar"]);
    expect(p).toContain("FIELD phone\n(no school rule");
    expect(p).toContain("FIELD scholar\n[R27]");
  });

  it("with a verdict, asks only for next steps and never for the decision", () => {
    const p = askPrompt("PAGE", "q", "Decision: NOT ALLOWED");
    expect(p).toContain("Do not repeat the decision or the reasons");
    expect(p).not.toContain("PAGE\nPAGE");
  });
});
