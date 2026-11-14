# Facts for the write-up (checked 2026-11-14)

Only what is marked verified may appear in the Devpost text or the video.

| Claim | Status | Source |
|---|---|---|
| 140,417 international students in Taiwan in the 2025/26 academic year | verified (page read 2026-11-14); page says data "may not reflect the up-to-date status" | Study in Taiwan, charts from the MOE Department of Statistics: https://www.studyintaiwan.org/why-taiwan/key-numbers/chart1?p=13 |
| 123,188 foreign students in Taiwan's universities in the 2024 academic year | verified (lead paragraph, 2025-09-05) | Focus Taiwan quoting the MOE: https://focustaiwan.tw/culture/202509050015 |
| Share of those who are degree-seeking | unknown (behind a paywall; a search summary said 76%, not seen) | do not use |
| "Most Taiwanese university admin systems are Chinese-only" | unknown, not measured | do not claim; say "can be Chinese-only" |
| On-device path sends no network request | verified 2026-11-13 (fetch hook on the page) | this repo |
| Cloud path request contains no student ID, name or phone | verified 2026-11-13 (captured request bodies) | this repo |
| Rule builder: 10/10 rules passed automatic checks in three runs (third run on camera); review found 1 mistranslation (run 1) and 1 omission (run 2) | verified 2026-11-14 | this repo, `src/kb/yunshan.json` `builtFrom` |
| On-device model answered "Yes, you can" then contradicted itself; twice gave "because they are required" as the reason | verified 2026-11-13/14 | this repo |
| User testing | none | — |
