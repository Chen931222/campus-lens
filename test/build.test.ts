import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { check, cnNumber, numbersInChinese, ruleId } from "../src/kb/build";

const regs = readFileSync(resolve(process.cwd(), "demo/rules-zh.md"), "utf8");
const art21 = "學生於加退選期間結束後，得申請停修課程，至遲應於學期第十二週週五下午五時前，於選課系統「停修申請」功能提出，逾期不予受理。每學期停修科目以二科為限。停修之科目於成績單登錄「W」，不列入學期學業平均成績計算。停修申請經核准後即生效，不得撤回。";

describe("Chinese numerals", () => {
  it("reads article numbers", () => {
    expect(cnNumber("二十一")).toBe(21);
    expect(cnNumber("十二")).toBe(12);
    expect(cnNumber("九")).toBe(9);
    expect(ruleId("第二十一條")).toBe("R21");
    expect(ruleId("Article 21")).toBeNull();
  });

  it("finds every number a passage states, including 下午五時 as 17", () => {
    const n = numbersInChinese(art21);
    for (const x of [12, 5, 17, 2]) expect(n.has(x)).toBe(true);
  });
});

describe("check", () => {
  const good = {
    article: "第二十一條",
    zh: "停修",
    title: "Course withdrawal",
    text: "You may withdraw until 17:00 on Friday of week 12, at most 2 courses per semester.",
    source: art21,
  };

  it("accepts a faithful rule and sets the id from the article number", () => {
    const c = check(good, regs);
    expect(c.problems).toEqual([]);
    expect(c.rule.id).toBe("R21");
  });

  it("rejects a number the article does not state", () => {
    expect(check({ ...good, text: "You may withdraw until week 14." }, regs).problems).toEqual(["The number 14 is not in the quoted source."]);
  });

  it("catches numbers written as words", () => {
    expect(check({ ...good, text: "Withdraw by Friday of the fourteenth week." }, regs).problems).toEqual(["The number 14 is not in the quoted source."]);
    expect(check({ ...good, text: "Withdraw by 5:00 PM on Friday of the twelfth week, at most two courses." }, regs).problems).toEqual([]);
  });

  it("rejects a quote that is not in the regulations", () => {
    expect(check({ ...good, source: "停修不限科數。" }, regs).problems).toContain("The quoted source is not in the regulations.");
  });
});
