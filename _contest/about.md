## Inspiration
Taiwan had 140,417 international students in the 2025/26 academic year (Study in Taiwan, from Ministry of Education statistics). The forms they have to get right, such as withdrawing from a course before week 12, can be in Chinese only. A student who cannot read the page has to guess, or paste it into a chatbot. But that page also holds their student ID, name, courses and phone number.

## What it does
- **Explain this page in English.** A short note beside the fields: what each is, and the one rule that matters.
- **Ask about the page.** "Do I get my fees back if I withdraw?" is answered from the school's own rules, with the rule cited.
- **Can I withdraw these?** Tick courses. The credit minimum and course limit are checked by code, and a "no" says which smaller choice is allowed.
- **Chrome extension.** The same lens on the real page, injected only when the student clicks the icon (`activeTab`).

## How we built it: the hybrid split
| Job | Where it runs | Why |
|---|---|---|
| The student's page (ID, name, courses, phone) | Gemini Nano on the device, `InferenceMode.ONLY_ON_DEVICE` | Personal data stays in the browser |
| Same, when the device has no model | Cloud Gemini, `ONLY_IN_CLOUD`, given a copy with every personal value blanked first | Everyone can use it |
| The school's public Chinese regulations → short English rules | Cloud Gemini, once per school | Long, Chinese, public, done once |
| Credit limits, course limits, "can I withdraw" | Code | The small model got this wrong |

Firebase AI Logic carries both paths. The app routes between device and cloud itself instead of letting the SDK choose (`PREFER_ON_DEVICE`), so the cloud path can only ever receive the redacted copy. App Check (reCAPTCHA Enterprise) is enforced; AI monitoring is off.

## What the model is not trusted with
Each of these came from a real failure while building:
- **Decisions.** Asked "12 credits, can I drop two 3-credit courses?", the on-device model said "Yes, you can", then that it would fall below the minimum. Writing next steps, it twice said two courses could not be dropped "because they are required"; the real reason is the 9-credit minimum. Decisions, reasons and next steps are now built by code and labelled "No AI was used for this answer."
- **Numbers and references.** The page header says 115學年度 (academic year 115); the model told the student to "follow the steps on page 115". Every sentence is checked before display: its numbers must appear in the rules or the page, its cited rules must exist, and invented page references are dropped.
- **The rule base.** Each English rule must quote its Chinese source, the quote must exist, and every number (including words like "twelfth") must be in it. In all three runs, all 10 rules passed these checks; reading them anyway still found a mistranslation in one run (自由填寫, "free text", became "optional") and an omitted clause in another (an approved withdrawal cannot be undone). So only rules a person approves are exported to the app.

## Challenges
- Redacting without breaking the rules: blanking the student's credit total "12" everywhere also erased "week 12" from the deadline. Short values are now blanked only where they sit.
- The on-device model sometimes ignores the JSON schema and answers as a markdown list; both shapes are parsed.

## Accomplishments
- Verified that the on-device path makes no network request, and, by capturing the cloud requests, that they contain no student ID, name or phone number.
- 34 automated tests, including property tests: for any course list, "allowed" is exactly "at most 2 courses and at least 9 credits left", and the cloud-safe text never contains the credit total.

## What we learned
Automatic checks catch wrong numbers, not wrong meaning. Every rule passed the checks, and a person reading them still found a mistranslation and a missing clause.

## What's next
- Rule bases for real schools, reviewed by their international offices, shared through Firestore.
- Leave and scholarship pages.
- Testing with international students. None has used it yet.

## Limits (stated, not hidden)
- One fictional school, one page. Every rule is invented for the demo.
- The rules were reviewed by the developer, not school staff.
- No user testing yet.
- The on-device model can still add small unsupported phrases without numbers.