import { useEffect } from 'react'
import PageHeader from './PageHeader'
import SiteFooter from './SiteFooter'
import RouteLink from './RouteLink'
import { go, type PageSlug } from '../lib/router'
import { SOURCES } from '../lib/sourceList'

// The public pages the footer links to: About, Sources, Legal disclaimers,
// Privacy. Each says only what the product does today; when the product
// changes (a new source, a new kind of stored data), change the page.
//
// The Legal and Privacy pages are plain descriptions written by the team,
// not documents drafted by a lawyer. CONTACT_EMAIL is shown on them once it
// is set.
const CONTACT_EMAIL: string | null = null
const UPDATED = 'October 8, 2026'

const TITLES: Record<PageSlug, string> = {
  about: 'About RegWay',
  sources: 'Sources',
  legal: 'Legal disclaimers',
  privacy: 'Privacy',
}

const NAV: { slug: PageSlug; label: string }[] = [
  { slug: 'about', label: 'About' },
  { slug: 'sources', label: 'Sources' },
  { slug: 'legal', label: 'Legal' },
  { slug: 'privacy', label: 'Privacy' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-900)', letterSpacing: '-0.015em' }}>{title}</h2>
      <div className="info-prose">{children}</div>
    </section>
  )
}

function Contact() {
  if (!CONTACT_EMAIL) return null
  return (
    <Section title="Contact">
      <p>
        Questions about this page: <a className="link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </Section>
  )
}

function About() {
  return (
    <>
      <p className="info-lead">
        RegWay reads new rules, enforcement actions and sanctions as they are published, and shows a private equity firm only the ones that affect it, its funds or its portfolio companies.
      </p>
      <Section title="Who it is for">
        <p>
          The people at a private equity firm who have to know what changed: general partners, compliance and legal teams, and the deal and operating partners responsible for portfolio companies.
        </p>
      </Section>
      <Section title="How it works">
        <ol>
          <li>
            <strong>You describe the firm.</strong> Where the firm, its funds and its portfolio companies are, what they do, and which fund holds which company. You can finish it later; a blank answer is treated as unknown, never as “no”.
          </li>
          <li>
            <strong>RegWay reads the official sources.</strong> Regulators' own publications in the United States, the United Kingdom and the European Union, plus a targeted web search for each portfolio company. The full list is on the <RouteLink className="link" to="/sources">Sources</RouteLink> page.
          </li>
          <li>
            <strong>You see what applies, and why.</strong> Each development on your dashboard carries the reason it is there, a link to the official document, and an analysis written for your firm. If a match looks wrong you can ask for it to be re-checked or dismiss it.
          </li>
        </ol>
      </Section>
      <Section title="What RegWay AI does">
        <p>
          RegWay AI is the assistant inside the product. It decides which developments are relevant to your firm, writes the analysis of each one, and answers questions in a chat that knows your firm's profile and searches live sources. It cites what it finds so you can read the original.
        </p>
        <p>
          It can be wrong. Treat what it writes as a first read, and check the official document before acting. More on this on the <RouteLink className="link" to="/legal">Legal disclaimers</RouteLink> page.
        </p>
      </Section>
    </>
  )
}

function Sources() {
  return (
    <>
      <p className="info-lead">
        RegWay reads official publications directly from the bodies that issue them. It does not rely on news coverage or commentary to find a development.
      </p>
      {SOURCES.map(group => (
        <Section key={group.region} title={group.region}>
          <ul>
            {group.names.map(name => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </Section>
      ))}
      <Section title="Research for each portfolio company">
        <p>
          The sources above are the same for every firm. In addition, RegWay AI runs a web search for each portfolio company, built from where the company is and what it does, to find recent regulatory activity that the fixed sources do not carry, including regulators outside the three regions above.
        </p>
      </Section>
      <Section title="What is not covered">
        <ul>
          <li>U.S. state and local regulators are not read directly. State-level items appear only when the per-company search finds them.</li>
          <li>CFTC and OFAC actions arrive through the Federal Register, which can be days after the agency's own announcement.</li>
          <li>A source can be unavailable for a time. When one has not updated recently, the dashboard says so.</li>
          <li>Coverage is not a guarantee of completeness. A development can exist that RegWay has not seen.</li>
        </ul>
      </Section>
    </>
  )
}

function Legal() {
  return (
    <>
      <p className="info-lead">RegWay is an information tool. It is not a law firm and nothing in it is legal advice.</p>
      <Section title="Not legal advice">
        <p>
          The developments, reasons, analyses and chat answers in RegWay are provided for general information. They do not create an attorney-client relationship, and they are not a substitute for advice from qualified counsel who knows your circumstances.
        </p>
      </Section>
      <Section title="Written by AI">
        <p>
          Relevance decisions, analyses and chat answers are written by an AI model. They can contain mistakes: a rule can be described incorrectly, a proposed rule can be mistaken for a final one, a deadline can be wrong, and a development can be matched to a firm or company it does not apply to. Always read the official document, which is linked from every development, before relying on anything RegWay says about it.
        </p>
      </Section>
      <Section title="Depends on what you tell it">
        <p>
          RegWay matches developments against the profile you enter for your firm, funds and portfolio companies. If that information is incomplete or out of date, relevant developments can be missed and irrelevant ones shown.
        </p>
      </Section>
      <Section title="Not complete, and not always current">
        <p>
          RegWay reads a fixed list of sources, described on the <RouteLink className="link" to="/sources">Sources</RouteLink> page, and does not cover every regulator or jurisdiction. Sources are read on a schedule, so a development can appear here some time after it is published, and a source can be temporarily unavailable.
        </p>
      </Section>
      <Section title="Your decisions are yours">
        <p>
          RegWay describes obligations and dates; it does not tell you what to do, and it does not rank how urgent something is for you. Compliance decisions remain the responsibility of you and your advisers.
        </p>
      </Section>
      <Contact />
    </>
  )
}

function Privacy() {
  return (
    <>
      <p className="info-lead">What RegWay stores about you and your firm, what it is used for, and who else handles it.</p>
      <Section title="What RegWay stores">
        <ul>
          <li>
            <strong>Your account:</strong> your name, email address and password. The password is stored only in hashed form by our sign-in provider; RegWay cannot read it.
          </li>
          <li>
            <strong>Your firm's profile:</strong> the answers you give about the firm, its funds and its portfolio companies, including which fund holds which company, any supporting-document names you type, and company logos you upload.
          </li>
          <li>
            <strong>What you do with developments:</strong> notes, flags, dismissals and re-check requests.
          </li>
          <li>
            <strong>Chat:</strong> your questions to RegWay AI and its answers, kept as conversations until you delete them. A file you attach is read with the message it was sent with and is not stored.
          </li>
          <li>
            <strong>Usage records:</strong> for each AI request, which feature made it and how large it was, so cost can be tracked. These hold no message text.
          </li>
        </ul>
      </Section>
      <Section title="What it is used for">
        <p>
          To decide which developments are relevant to your firm, to write the analysis of each, to answer your questions, and to keep your account working. RegWay does not sell your information and does not use it for advertising.
        </p>
      </Section>
      <Section title="Who else handles it">
        <p>RegWay runs on services provided by other companies, which process information on its behalf:</p>
        <ul>
          <li>a hosting provider, which serves the website;</li>
          <li>a database and sign-in provider, which stores the information listed above;</li>
          <li>
            an AI model provider. To match developments, write analyses and answer chat questions, the relevant parts of your firm's profile, your question and any file attached to it are sent to this provider.
          </li>
        </ul>
        <p>Your firm's information is visible only to members of your firm's account.</p>
      </Section>
      <Section title="In your browser">
        <p>
          RegWay keeps your sign-in session, your light or dark preference and a copy of recently viewed data in your browser's storage so pages open quickly. This copy is cleared when you sign out. RegWay does not use advertising or third-party analytics trackers.
        </p>
      </Section>
      <Section title="Your choices">
        <ul>
          <li>You can change your name, email, password and every profile answer in Profile.</li>
          <li>You can delete any saved conversation from the chat's sidebar.</li>
          <li>You can remove a fund or portfolio company, which deletes its profile.</li>
        </ul>
      </Section>
      <Contact />
    </>
  )
}

const BODY: Record<PageSlug, () => React.ReactNode> = { about: About, sources: Sources, legal: Legal, privacy: Privacy }

export default function InfoPage({ slug, signedIn }: { slug: PageSlug; signedIn: boolean }) {
  const Body = BODY[slug]

  // The tab shows which page this is; the app's own title returns on leaving.
  useEffect(() => {
    const before = document.title
    document.title = `${TITLES[slug]} · RegWay AI`
    return () => {
      document.title = before
    }
  }, [slug])

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <a href="#main" className="skip-link">Skip to content</a>
      <PageHeader back={{ label: signedIn ? 'Dashboard' : 'Home', onClick: () => go('/') }} />
      <main id="main" className="flex-1 w-full max-w-[1200px] mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-24">
        <div className="max-w-2xl mx-auto">
          <nav aria-label="About RegWay" className="flex flex-wrap gap-2 mb-10">
            {NAV.map(item => (
              <RouteLink key={item.slug} to={`/${item.slug}`} aria-current={item.slug === slug ? 'page' : undefined} className={`btn-tool ${item.slug === slug ? 'is-on' : ''}`}>
                {item.label}
              </RouteLink>
            ))}
          </nav>
          <h1 className="text-[30px] sm:text-[36px] font-semibold" style={{ color: 'var(--text-900)', letterSpacing: '-0.035em', lineHeight: 1.15 }}>
            {TITLES[slug]}
          </h1>
          {(slug === 'legal' || slug === 'privacy') && (
            <p className="text-[13px] mt-3 num" style={{ color: 'var(--text-400)' }}>Last updated {UPDATED}</p>
          )}
          <div className="mt-6">
            <Body />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
