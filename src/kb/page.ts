import { askPublic } from "../lens/ai";
import { kbPrompt, kbSchema, parseKb, type Checked, type KbRule } from "./build";
import regulations from "../../demo/rules-zh.md?raw";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

/**
 * Automatic checks catch wrong numbers and invented quotes, not wrong meaning: the cloud model
 * once turned 自由填寫 ("free text") into "optional". So nothing is published until a person has
 * read each rule next to its Chinese source and ticked it.
 */
interface Row {
  checked: Checked;
  approved: boolean;
  text: string;
}

let rows: Row[] = [];

function td(text: string, cls?: string): HTMLTableCellElement {
  const c = document.createElement("td");
  c.textContent = text;
  if (cls) c.className = cls;
  return c;
}

function render(): void {
  const body = $("#rules tbody");
  body.replaceChildren();
  rows.forEach((row, i) => {
    const { rule, problems } = row.checked;
    const tr = document.createElement("tr");
    tr.className = problems.length ? "bad" : row.approved ? "ok" : "";
    const edit = document.createElement("textarea");
    edit.value = row.text;
    edit.rows = 4;
    edit.disabled = problems.length > 0;
    edit.setAttribute("aria-label", `English text of ${rule.id}`);
    edit.addEventListener("input", () => {
      row.text = edit.value;
      row.approved = false;
      render();
    });
    const textCell = document.createElement("td");
    textCell.append(edit);
    const review = document.createElement("td");
    if (problems.length) review.textContent = problems.join(" ");
    else {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = row.approved;
      box.addEventListener("change", () => {
        row.approved = box.checked;
        render();
      });
      label.append(box, " Matches the source");
      review.append(label);
    }
    tr.append(td(rule.id), td(`${rule.zh}\n${rule.source}`, "zh"), textCell, review);
    body.append(tr);
    void i;
  });
  const approved = rows.filter((r) => r.approved);
  $("#publish-status").textContent = `${approved.length} of ${rows.length} approved.`;
  const a = $<HTMLAnchorElement>("#download");
  a.hidden = approved.length === 0;
  if (approved.length) {
    const out: (KbRule & { reviewed: true; editedByReviewer: boolean })[] = approved.map((r) => ({
      ...r.checked.rule,
      text: r.text.trim(),
      reviewed: true,
      editedByReviewer: r.text.trim() !== r.checked.rule.text,
    }));
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ rules: out }, null, 2)], { type: "application/json" }));
  }
}

$("#source").textContent = regulations;

$("#build").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("#build");
  btn.disabled = true;
  $("#status").textContent = "Sending the public regulations to the cloud model…";
  const t0 = performance.now();
  try {
    const { text, source } = await askPublic(kbPrompt(regulations), kbSchema);
    const results = parseKb(text, regulations);
    rows = results.map((checked) => ({ checked, approved: false, text: checked.rule.text }));
    (window as unknown as { __kb: Checked[] }).__kb = results;
    const passed = results.filter((r) => !r.problems.length).length;
    $("#status").textContent = `${passed} of ${results.length} rules passed the automatic checks in ${((performance.now() - t0) / 1000).toFixed(1)} s (${source === "in_cloud" ? "cloud" : "device"}). Read each one against its source before approving.`;
    render();
  } catch (err) {
    $("#status").textContent = `Failed: ${(err as Error).message}`;
  } finally {
    btn.disabled = false;
  }
});
