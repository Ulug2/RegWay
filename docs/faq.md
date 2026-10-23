# FAQ: questions and draft answers

The questions for the public FAQ page (`/faq`, roadmap 16f), with draft
answers taken from what the product does today. Written on 2026-10-23 for
the team. Whoever builds the page uses this file as its text; the owner
approves the answers before the page goes live.

- **Owner to answer** marks an answer that needs a fact or a decision the
  code cannot give.
- Keep the answers true to the product. When the product changes (a new
  source, a new kind of stored data), change the answer here and on the
  page, the same as the About, Sources and Privacy pages.
- Style: short paragraphs, no em-dashes, the same voice as `/about`
  (`DESIGN.md`, Typography).

## The product

### What is RegWay?
RegWay reads new rules, enforcement actions and sanctions as they are
published, and shows a private equity firm only the ones that affect the
firm, its funds or its portfolio companies. Each one comes with the reason
it applies, a link to the official document and an analysis written for
the firm.

### Who is it for?
The people at a private equity firm who have to know what changed: general
partners, compliance and legal teams, and the deal and operating partners
responsible for portfolio companies.

### How is it different from a newsletter or a news alert?
A newsletter sends everyone the same list. RegWay starts from your firm's
profile (where the firm, its funds and its companies are, what they do,
which fund holds which company) and shows only what touches them, with the
reason it applies to you. It reads the regulators' own publications, not
news coverage.

### Does RegWay cover firms outside the United States?
The firm and its funds must be US-based. Portfolio companies can be
anywhere: RegWay reads UK and EU regulators and sanctions lists, and a web
search for each company reaches regulators in other countries.

## Where the information comes from

### Which sources does RegWay read?
The Federal Register for 64 U.S. agencies; SEC, FTC and CFPB announcements;
SEC and FINRA enforcement; U.S. travel advisories; UK and EU regulators and
sanctions lists. The full list is on the Sources page. On top of these, a
web search runs for each portfolio company.

### How quickly does a new development appear?
Sources are read on a schedule, so a development appears some time after
it is published. **Owner to answer:** whether to give a figure, and which
(check the schedules in `supabase/migrations/` first).

### What does RegWay not cover?
U.S. state and local regulators are not read directly; state items appear
only when the per-company search finds them. CFTC and OFAC actions arrive
through the Federal Register, which can be days after the agency's own
announcement. No list of sources is complete: a development can exist that
RegWay has not seen.

### Can I suggest a source?
**Owner to answer:** yes or no, and how (an email address, a form).

## How matching works

### How does RegWay decide what applies to my firm?
An AI model compares each new document with your firm's profile and keeps
it only when it can name the obligation the document creates and the fund,
company or place it touches. **Owner to answer:** whether to mention the
second review of each match (the Skeptic, item 17) once it is switched on. A blank answer in your profile is treated as
unknown, never as "no".

### How often is it wrong?
It can miss a development or show one that does not apply. The more
complete your profile, the fewer of both. Every development links to the
official document; read it before acting. **Owner to answer:** whether to
publish a measured rate once there is one.

### What do I do when a match looks wrong?
Ask for it to be re-checked, or dismiss it. Dismissed developments are listed in
Profile → Dismissed.

### What happens when I change my firm's profile?
RegWay re-checks your matches against the new profile and searches again
for the companies you changed, so the dashboard follows the edit.

### Is this legal advice?
No. RegWay is an information tool, not a law firm. See the Legal
disclaimers page.

## The AI

### What does RegWay AI do?
It decides which developments are relevant to your firm, writes the
analysis of each one, and answers questions in a chat that knows your
firm's profile and searches live sources. It cites what it finds so you can
read the original.

### Which AI model does RegWay use?
Anthropic's Claude. **Owner to answer:** whether to name the provider on
the public page (the Privacy page names providers by kind only).

### What does the AI see about my firm?
The parts of your firm's profile a task needs, your chat questions, and any
file you attach to a question. Attached files are read with the message and
not stored.

### Is my data used to train AI models?
**Owner to answer**, after the security audit (roadmap 16g, part 5) checks
the provider's terms. Do not publish an answer before then.

## Your data and account

### Who can see my firm's information?
Only members of your firm's account. Other firms cannot see your profile,
your matches, your notes or your conversations.

### What does RegWay store?
Your account, your firm's profile, what you do with developments (notes,
flags, dismissals), your chat conversations until you delete them, and
usage records with no message text. The Privacy page has the detail.

### Can more than one person at my firm use RegWay?
Not yet: one person per firm account today. **Owner to answer:** whether to
say when this is planned.

### How do I delete my data?
You can delete conversations and remove funds and companies yourself.
**Owner to answer:** how to ask for the whole account to be deleted (needs
a contact address).

## Access and pricing

### How do I get access?
**Owner to answer:** open sign-up, a waitlist, or a demo request.

### What does it cost?
**Owner to answer.**

### Is there a free trial?
**Owner to answer.**

### How do I contact you?
**Owner to answer:** the contact address (`CONTACT_EMAIL` in
`src/components/InfoPage.tsx` is unset).
