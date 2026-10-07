# Source registry grounding (roadmap item 14)

## Prompt

> Finish as many things as u can by that time. But don't rush

## 1. Defense trade controls (DDTC / ITAR): done

The registry (§17, §18) names DDTC as a source for defense and aerospace
companies. It has no Federal Register agency of its own: it publishes
under `state-department`, next to passport, visa and consular-fee rules.

Checked one year of State Department rules and proposed rules
(2025-10 → 2026-10): 33 documents, 15 of them ITAR. Every ITAR document,
and none of the other 18, has "International Traffic in Arms Regulations"
in its title. State Department notices (146 in six months) are sanctions
determinations, information collections and Congressional notifications:
not taken.

Built: a `defenseTradeControls` feed in `sync-federal-register` (State
Department RULE / PRORULE, kept when the title or abstract names the ITAR
or the U.S. Munitions List), filed as geopolitical like BIS export
controls. First sync stored 2: the Syria country-policy revision (tagged
Syria) and the U.S. Munitions List review (no country: a candidate for any
firm with a foreign footprint).

## 2. Feeding the registry into the company scan's search prompt: tested, not shipped

Built and unit-tested: the registry's sections 1–38 as data (338 sources),
a mapping from a company's recorded industries and activities to at most
four sections, and a paragraph added to `company-regulations`'s search
prompt. Then run live on GetixHealth's recorded facts (same model, five
searches, the scan's own prompt), three ways:

| Prompt | Searches the model ran | Items found |
|---|---|---|
| As it is today | By topic and time: "medical billing coding compliance regulations 2026", "CMS Medicare regulations July August September 2026", "Texas healthcare regulations 2026" | **8**, 7 inside the 90-day window (FY 2027 CMS payment rules, ICD-10 updates, the CY 2027 fee schedule proposal) |
| + each source with what it covers, "search them first" | One generic query per regulator: "HHS OCR HIPAA rules 2026", "HHS OIG healthcare compliance 2026" | **2**, both older than 90 days; never reached Texas |
| + source names and sites only, "use the list to tell official from commentary; search by activity" | Mixed | **0**: it listed four things and ruled each out |

One run each, so not a measurement, but both grounded versions were
clearly worse and in the same direction: the list pulls the model toward
regulators and away from "what changed recently for this activity", and
with five searches there is no budget for both. Removed rather than
shipped. Cost of the three runs: about $0.50 (direct API calls, so not in
`usage_events`).

What might work instead, untested:
- Use the registry after the search, not before: in the extraction step,
  to drop items whose source isn't an official one.
- Give the scan more searches (cost: about $0.01 each plus tokens) before
  adding a longer plan.
- Use the registry to choose which agencies' Federal Register documents a
  firm's matcher reads, which is deterministic and free.
