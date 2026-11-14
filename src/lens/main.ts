import { askPage, deviceStatus, warmUp, type Source } from "./ai";
import { askPrompt, notesPrompt, notesSchema, parseNotes, rulesForField, rulesText, unknownCitations, type Note } from "./prompts";
import { ground } from "./guard";
import { asksPermission, coursesInText, evaluate, nextSteps, readCourses, tickedCourses, type Course, type Verdict } from "./rules";
import { contextText, scanPage, scanRedacted } from "./scan";
import kb from "../kb/yunshan.json";
import "./lens.css";

const ruleById = new Map(kb.rules.map((r) => [r.id, r]));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, txt?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}

function sourceLabel(source: Source, redacted: boolean): string {
  if (source === "on_device") return "Answered on this device. Nothing on this page left your computer.";
  return redacted
    ? "Answered in the cloud. Your ID, name, credits and phone were removed first."
    : "Answered in the cloud.";
}

function anchorFor(key: string): Element | null {
  if (key === "course") return document.querySelector(".courses");
  return document.querySelector(`[name="${key}"]`)?.closest(".row") ?? null;
}

function renderNote(n: Note): void {
  const anchor = anchorFor(n.key);
  if (!anchor) return;
  anchor.querySelector(":scope > .cl-note")?.remove();
  if (anchor.nextElementSibling?.classList.contains("cl-note")) anchor.nextElementSibling.remove();
  const box = el("aside", "cl-note");
  box.append(el("p", "cl-note-text", n.note));
  if (n.rules.length) {
    const refs = el("p", "cl-refs");
    for (const id of n.rules) {
      const r = ruleById.get(id);
      const b = el("button", "cl-ref", id);
      b.type = "button";
      b.title = r ? `${r.title}: ${r.text}` : id;
      b.addEventListener("click", () => openRule(id));
      refs.append(b);
    }
    box.append(refs);
  }
  if (anchor.classList.contains("courses")) anchor.after(box);
  else anchor.append(box);
}

function openRule(id: string): void {
  const r = ruleById.get(id);
  const out = document.querySelector<HTMLElement>(".cl-answer");
  if (!r || !out) return;
  out.replaceChildren(el("p", "cl-rule-head", `${r.id} · ${r.title} (${r.zh})`), el("p", undefined, r.text));
}

function build(): void {
  const panel = el("section", "cl-panel");
  panel.setAttribute("aria-label", "Campus Lens");
  const head = el("header", "cl-head");
  const title = el("div", "cl-title");
  title.append(el("strong", undefined, "Campus Lens"), el("span", "cl-school", kb.school));
  const toggle = el("button", "cl-toggle", "Hide");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "true");
  head.append(title, toggle);
  const body = el("div", "cl-body");
  body.id = "cl-body";
  toggle.setAttribute("aria-controls", body.id);
  toggle.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("is-collapsed");
    toggle.textContent = collapsed ? "Show" : "Hide";
    toggle.setAttribute("aria-expanded", String(!collapsed));
  });
  const status = el("p", "cl-status", "Checking the on-device model…");
  const start = el("button", "cl-start", "Explain this page in English");
  start.type = "button";
  const form = el("form", "cl-ask");
  const input = el("input");
  input.placeholder = "Ask about this page";
  input.setAttribute("aria-label", "Question");
  const send = el("button", undefined, "Ask");
  send.type = "submit";
  form.append(input, send);
  const answer = el("div", "cl-answer");
  answer.setAttribute("aria-live", "polite");
  const source = el("p", "cl-source");
  body.append(status, start, form, answer, source);
  panel.append(head, body);
  document.body.append(panel);

  deviceStatus().then((s) => {
    status.textContent =
      s === "available" ? "On-device model ready. Your page stays on this computer."
      : s === "downloadable" || s === "downloading" ? "On-device model not downloaded yet. The first click starts the download."
      : "No on-device model in this browser. Answers will come from the cloud with your personal data removed.";
  });

  start.addEventListener("click", async () => {
    start.disabled = true;
    status.textContent = "Reading the page…";
    try {
      await warmUp((p) => (status.textContent = `Downloading the on-device model: ${Math.round(p * 100)}%`)).catch(() => {});
      const ctx = scanPage();
      const keys = ctx.fields.map((f) => f.key);
      const t0 = performance.now();
      const res = await askPage(
        (p) => notesPrompt(p, keys),
        contextText(ctx),
        contextText(scanRedacted()),
        (t) => {
          if (import.meta.env.DEV) (window as unknown as { __raw: string }).__raw = t;
          return parseNotes(t, keys);
        },
        notesSchema,
      );
      const pageText = contextText(ctx);
      let dropped = 0;
      const notes = res.value
        .map((n) => {
          const allowed = rulesForField(n.key);
          const g = ground(n.note, `${allowed.map((id) => ruleById.get(id)?.text ?? "").join(" ")} ${pageText}`);
          dropped += g.removed.length;
          return { ...n, note: g.text, rules: n.rules.filter((id) => allowed.includes(id)) };
        })
        .filter((n) => n.note.length > 0);
      notes.forEach(renderNote);
      status.textContent = `${notes.length} of ${keys.length} fields explained in ${((performance.now() - t0) / 1000).toFixed(1)} s.${dropped ? ` ${dropped} unsupported sentence${dropped === 1 ? "" : "s"} removed.` : ""}`;
      source.textContent = sourceLabel(res.source, res.redacted);
      start.textContent = "Explain again";
    } catch (err) {
      status.textContent = `Could not explain this page: ${(err as Error).message}`;
    } finally {
      start.disabled = false;
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    send.disabled = true;
    answer.textContent = "Thinking…";
    try {
      const ctx = scanPage();
      const courses = readCourses();
      const named = coursesInText(courses, q);
      const selected = named.length ? named : asksPermission(q) ? tickedCourses(courses) : [];
      const verdict = selected.length ? evaluate(courses, selected) : null;
      if (verdict) {
        // Decision, reasons and next steps all come from code. No model call, nothing to get wrong.
        answer.replaceChildren(verdictBox(verdict), stepsBox(courses, verdict));
        source.textContent = "Checked by the app on this device. No AI was used for this answer.";
        return;
      }
      const res = await askPage((p) => askPrompt(p, q), contextText(ctx), contextText(scanRedacted()), (t) => t.trim());
      answer.replaceChildren();
      const g = ground(res.value, `${rulesText}\n${contextText(ctx)}`);
      answer.append(el("p", undefined, g.text || "No usable answer. Ask the department office (系辦)."));
      if (g.removed.length) {
        answer.append(el("p", "cl-warn", `Removed ${g.removed.length} sentence${g.removed.length === 1 ? "" : "s"} that mentioned something not in the rules or on this page.`));
      }
      const bad = unknownCitations(g.text);
      if (bad.length) answer.append(el("p", "cl-warn", `Cited ${bad.join(", ")}, which is not in this school's rules. Do not rely on that part.`));
      source.textContent = sourceLabel(res.source, res.redacted);
    } catch (err) {
      answer.textContent = `Could not answer: ${(err as Error).message}`;
    } finally {
      send.disabled = false;
    }
  });

  // Ticking courses gives an instant check under the table, with no model involved.
  const table = document.querySelector(".courses");
  table?.addEventListener("change", () => {
    const courses = readCourses();
    const ticked = tickedCourses(courses);
    document.querySelector(".cl-check")?.remove();
    if (!ticked.length) return;
    const v = evaluate(courses, ticked);
    const box = el("div", "cl-check");
    box.append(verdictBox(v), stepsBox(courses, v));
    // Keep the table's own margin note directly under it; the check goes after the note.
    const note = table.nextElementSibling?.classList.contains("cl-note") ? table.nextElementSibling : null;
    (note ?? table).after(box);
  });
}

function stepsBox(courses: Course[], v: Verdict): HTMLElement {
  const box = el("div", "cl-steps");
  box.append(el("p", "cl-next-head", v.allowed ? "What to do next" : "What you can do instead"));
  const ol = el("ol");
  for (const s of nextSteps(courses, v)) {
    const li = el("li", undefined, s.text);
    for (const id of s.rules) {
      const b = el("button", "cl-ref", id);
      b.type = "button";
      b.title = ruleById.get(id)?.text ?? id;
      b.addEventListener("click", () => openRule(id));
      li.append(" ", b);
    }
    ol.append(li);
  }
  box.append(ol);
  return box;
}

/** Computed by code from the course table. Shown above the model's words, never replaced by them. */
function verdictBox(v: Verdict): HTMLElement {
  const box = el("div", `cl-verdict ${v.allowed ? "is-ok" : "is-no"}`);
  const head = el("p", "cl-verdict-head");
  head.append(statusIcon(v.allowed), document.createTextNode(v.allowed ? "Allowed" : "Not allowed"));
  box.append(head);
  const list = el("ul");
  for (const f of v.findings) {
    const li = el("li", f.ok ? undefined : "is-fail");
    li.append(el("span", "cl-verdict-rule", f.rule), document.createTextNode(` ${f.text}`));
    list.append(li);
  }
  box.append(list, el("p", "cl-verdict-foot", "Checked by the app from your course table, not by the AI."));
  return box;
}

/** True on a page this rule base was written for. Other pages get a plain "not supported" note. */
export function isSupportedPage(doc: Document = document): boolean {
  return (doc.querySelector(".sch-name")?.textContent ?? "").includes("國立雲杉大學") && !!doc.querySelector(".form, .courses");
}

/** Adds the panel once, however many times the extension icon is clicked. */
export function mount(): void {
  const w = window as unknown as { __campusLens?: boolean };
  if (w.__campusLens) {
    document.querySelector<HTMLElement>(".cl-panel")?.scrollIntoView({ block: "end" });
    return;
  }
  w.__campusLens = true;
  if (isSupportedPage()) {
    build();
    return;
  }
  const note = el("section", "cl-panel");
  note.setAttribute("aria-label", "Campus Lens");
  const head = el("header", "cl-head");
  const title = el("div", "cl-title");
  title.append(el("strong", undefined, "Campus Lens"));
  const close = el("button", "cl-toggle", "Close");
  close.type = "button";
  close.addEventListener("click", () => {
    note.remove();
    w.__campusLens = false;
  });
  head.append(title, close);
  const body = el("div", "cl-body");
  body.append(el("p", "cl-status", "No rules for this page yet. Campus Lens only reads pages from schools whose regulations have been built into English and reviewed."));
  note.append(head, body);
  document.body.append(note);
}


/** Drawn check / cross, same 1.75 stroke, inheriting the verdict colour. */
function statusIcon(ok: boolean): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", ok ? "M3.5 8.5l3 3 6-7" : "M4.5 4.5l7 7M11.5 4.5l-7 7");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.75");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}
