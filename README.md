# Campus Lens

English margin notes for Chinese-only university admin pages. The page is read by the AI in your own browser; the cloud only ever sees a copy with your personal data removed.

**Try it:** https://campus-lens-xi.vercel.app (fictional school, course-withdrawal page). In desktop Chrome with the built-in model everything stays on your computer; elsewhere answers come from the cloud with personal data removed (tested in Chrome and a Chromium-based browser).

Built for #BuildHybridAI 2026 with Firebase AI Logic hybrid inference.

## The problem

Many Taiwanese university systems (course withdrawal, leave, scholarships) are in Chinese only. An international student who cannot read the page has to guess what each field means, or ask someone, before a deadline they may not know about. The page also holds their student ID, name, grades and phone number, which they should not paste into a chatbot.

## What it does

- **Explain this page in English.** A short note appears beside every field: what it is and the one rule that matters (a limit, a deadline, who reads it).
- **Ask about the page.** "Do I get my fees back if I withdraw?" is answered from the school's rules, with the rule cited, e.g. [R25].
- **Can I withdraw these?** Tick courses or name them in a question. The app checks the credit minimum and course limit itself and, when the answer is no, says which smaller choice would be allowed.
- **Chrome extension.** The same lens on the real page, injected only when you click the icon (`activeTab`; it cannot read pages you have not asked it to).

## How the work is split

| Job | Who does it | Why |
|---|---|---|
| Turn the school's public Chinese regulations into short English rules | Cloud model (`ONLY_IN_CLOUD`), once per school | Long Chinese text; public; done once |
| Check those rules | Code, then a person | See below |
| Read the student's page and write notes or answers | On-device Gemini Nano (`ONLY_ON_DEVICE`) | The page holds personal data |
| Same, on a computer with no on-device model | Cloud model, given a **redacted** copy | Everyone can use it; personal values are blanked first |
| Credit limits, course limits, "can I withdraw" | Code | A small model got the arithmetic and the reasons wrong |

## What the model is not trusted with

Each of these was added after a real failure:

- **Decisions.** Asked "I have 12 credits, can I drop two 3-credit courses?", the on-device model said "Yes, you can" and then that it would put the student below the minimum. Later, writing next steps, it twice gave "because they are required" as the reason; the real reason is the 9-credit minimum. Withdrawal decisions, reasons and next steps are now built by code ([`src/lens/rules.ts`](src/lens/rules.ts)) and labelled "No AI was used for this answer."
- **Numbers and references.** The page header says 115學年度 (academic year 115); the model told the student to "follow the steps on page 115". Every sentence the student sees is checked: each number must appear in the rules or the page, each cited rule id must exist, and "page/section N" references are dropped ([`src/lens/guard.ts`](src/lens/guard.ts)).
- **The rule base.** The cloud model's English rules must quote their Chinese source; the quote must exist in the regulations; every number (including words like "twelfth") must be in the quote; rule ids come from article numbers. In two runs these checks passed 10 of 10 rules, and a person reading them still found a mistranslation (自由填寫, "free text", rendered as "optional") and an omitted clause (an approved withdrawal cannot be undone). So nothing is published until a person approves each rule ([`demo/build-kb.html`](demo/build-kb.html), [`src/kb/build.ts`](src/kb/build.ts)).

## Privacy

- On-device path: verified that the page makes no network request while explaining or answering.
- Cloud path: verified by capturing the actual requests that the student ID, name and phone number are not in them. Short personal values (the credit total "12") are blanked where they sit, so "week 12" in the rules survives.
- App Check (reCAPTCHA Enterprise) is enforced, so the cloud model only answers requests from the site.
- AI monitoring in Firebase is off.

## Limits

- One fictional school, one page (course withdrawal). Every rule in [`src/kb/yunshan.json`](src/kb/yunshan.json) is invented for the demo.
- The rule base was reviewed by the developer, not by school staff.
- **No user testing yet.** No international student has used it.
- The on-device model can still add small unsupported phrases without numbers (one note said a phone number was "for emergency communication"). The guard does not catch those.
- The extension's cloud fallback is not tested. It was built before App Check was set up, and reCAPTCHA may not run inside a content script; on a computer without the on-device model, use the demo site.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in your Firebase web config
npm run dev                  # http://localhost:5181/demo/withdraw.html
npm test                     # 34 tests
npm run build:ext            # Chrome extension in dist-ext/ (load unpacked)
```

For local cloud calls, register an App Check debug token in the Firebase console and put it in `.env.local` as `VITE_APPCHECK_DEBUG_TOKEN`. Never commit it.

Firebase AI Logic is called in [`src/lens/ai.ts`](src/lens/ai.ts): `getGenerativeModel` with `InferenceMode.ONLY_ON_DEVICE` for the student's page and `InferenceMode.ONLY_IN_CLOUD` for the redacted copy and the rule builder.

## Built with

TypeScript, Vite, Vitest, fast-check, Firebase JS SDK (AI Logic, App Check), Chrome Prompt API (through Firebase AI Logic), Vercel. Written with Claude Code.

## License

Apache-2.0
