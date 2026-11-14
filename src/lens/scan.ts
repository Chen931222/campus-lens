/**
 * Reads the admin page the student is on and turns it into plain structured context.
 *
 * Two versions of the same page come out of here:
 * - `full`: labels, options, notices AND the student's own values (ID, name, credits, phone).
 *   Only ever given to the on-device model.
 * - `redacted`: the same page with every personal value replaced by a placeholder.
 *   This is the only version that may leave the device.
 */

export interface PageField {
  /** Stable key for placing a note next to the control. */
  key: string;
  labelZh: string;
  kind: "select" | "text" | "radio" | "checkbox" | "table-choice";
  options: string[];
  /** Current value, if the field is marked personal; null otherwise. */
  personalValue: string | null;
}

export interface PageContext {
  title: string;
  breadcrumb: string;
  notices: string[];
  table: string[];
  fields: PageField[];
  personal: string[];
}

const PERSONAL = "[personal]";

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function labelFor(control: Element): string {
  const row = control.closest(".row, label, tr");
  const lbl = row?.querySelector(".lbl");
  if (lbl) return text(lbl);
  if (row && row.tagName === "LABEL") return text(row);
  return control.getAttribute("name") ?? "";
}

/** Collects the page as structured context. Pure DOM read, no network. */
export function scanPage(doc: Document = document): PageContext {
  const fields: PageField[] = [];
  const seen = new Set<string>();

  for (const control of doc.querySelectorAll<HTMLElement>(".form select, .form textarea, .form input")) {
    const name = control.getAttribute("name") ?? "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const input = control as HTMLInputElement;
    const kind: PageField["kind"] =
      control.tagName === "SELECT" ? "select"
      : input.type === "radio" ? "radio"
      : input.type === "checkbox" ? "checkbox"
      : "text";
    const options =
      kind === "select" ? [...(control as HTMLSelectElement).options].map((o) => text(o)).filter(Boolean)
      : kind === "radio" ? [...doc.querySelectorAll(`input[name="${name}"]`)].map((r) => text(r.closest("label")))
      : [];
    fields.push({
      key: name,
      labelZh: labelFor(control),
      kind,
      options,
      personalValue: control.hasAttribute("data-personal") ? input.value : null,
    });
  }

  const table = [...doc.querySelectorAll(".courses tr")].map((tr) =>
    [...tr.children].map((c) => text(c)).join(" | "),
  );
  if (doc.querySelector(".courses")) {
    fields.unshift({ key: "course", labelZh: "選（停修科目）", kind: "table-choice", options: [], personalValue: null });
  }

  return {
    title: text(doc.querySelector("h1")),
    breadcrumb: text(doc.querySelector(".sch-nav")),
    notices: [...doc.querySelectorAll(".notice li")].map((li) => text(li)),
    table,
    fields,
    personal: [...doc.querySelectorAll("[data-personal]")].map((el) =>
      el instanceof HTMLInputElement ? el.value : text(el),
    ),
  };
}

/**
 * The page as it may leave the device: every element marked personal is blanked at the source,
 * then any longer personal value that also appears elsewhere (a name in a heading) is scrubbed.
 * Short values such as a credit count are only blanked where they sit, so "week 12" survives.
 */
export function scanRedacted(doc: Document = document): PageContext {
  const original = scanPage(doc);
  const clone = doc.cloneNode(true) as Document;
  for (const el of clone.querySelectorAll("[data-personal]")) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = PERSONAL;
      el.setAttribute("value", PERSONAL);
    } else el.textContent = PERSONAL;
  }
  const ctx = scanPage(clone);
  const long = original.personal.filter((v) => v.length >= 4).sort((a, b) => b.length - a.length);
  const scrub = (s: string) => long.reduce((acc, v) => acc.split(v).join(PERSONAL), s);
  return {
    title: scrub(ctx.title),
    breadcrumb: scrub(ctx.breadcrumb),
    notices: ctx.notices.map(scrub),
    table: ctx.table.map(scrub),
    fields: ctx.fields.map((f) => ({ ...f, labelZh: scrub(f.labelZh), options: f.options.map(scrub) })),
    personal: ctx.personal.map(() => PERSONAL),
  };
}

/** Renders the context as compact text for a prompt. */
export function contextText(ctx: PageContext): string {
  return [
    `Page: ${ctx.title}`,
    `Path: ${ctx.breadcrumb}`,
    `Notices:\n${ctx.notices.map((n, i) => `${i + 1}. ${n}`).join("\n")}`,
    ctx.table.length ? `Table:\n${ctx.table.join("\n")}` : "",
    `Fields:\n${ctx.fields
      .map((f) => `- ${f.key}: ${f.labelZh} (${f.kind})${f.options.length ? ` options: ${f.options.join(" / ")}` : ""}${f.personalValue !== null ? ` value: ${f.personalValue}` : ""}`)
      .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
