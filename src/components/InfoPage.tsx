import { useEffect } from 'react'
import PageHeader from './PageHeader'
import SiteFooter from './SiteFooter'
import RouteLink from './RouteLink'
import { go, type PageSlug } from '../lib/router'
import { SOURCES } from '../lib/sourceList'
import { User, UsersThree } from './icons'

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

// Legal and Privacy read as documents: a summary, numbered sections with
// their own anchors, and a list of them beside the text on a wide screen.
type Clause = { id: string; title: string; body: React.ReactNode }

function DocumentBody({ lead, clauses }: { lead: string; clauses: Clause[] }) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_200px] lg:gap-16 items-start">
      <div className="max-w-2xl min-w-0">
        <p className="info-lead info-summary">{lead}</p>
        <nav aria-label="On this page" className="lg:hidden mt-8 info-toc">
          <TocList clauses={clauses} />
        </nav>
        {clauses.map((clause, i) => (
          <section key={clause.id} id={clause.id} className="info-clause">
            <h2 className="flex gap-3 items-baseline text-lg font-semibold mb-3" style={{ color: 'var(--text-900)', letterSpacing: '-0.015em' }}>
              <span className="num font-mono text-[13px] font-medium" style={{ color: 'var(--text-300)' }}>{String(i + 1).padStart(2, '0')}</span>
              {clause.title}
            </h2>
            <div className="info-prose">{clause.body}</div>
          </section>
        ))}
        <Contact />
      </div>
      <nav aria-label="On this page" className="hidden lg:block lg:sticky lg:top-24 info-toc-side">
        <TocList clauses={clauses} />
      </nav>
    </div>
  )
}

function TocList({ clauses }: { clauses: Clause[] }) {
  return (
    <>
      <p className="section-label mb-3">On this page</p>
      <ol className="space-y-2">
        {clauses.map((clause, i) => (
          <li key={clause.id} className="flex gap-2.5 text-[13px] leading-snug">
            <span className="num font-mono" style={{ color: 'var(--text-300)' }}>{String(i + 1).padStart(2, '0')}</span>
            <a href={`#${clause.id}`} className="footer-link">{clause.title}</a>
          </li>
        ))}
      </ol>
    </>
  )
}

// The people behind RegWay. A bio still reading as a template is shown as
// one, in grey. To add a photo, put it in public/team/ and set `photo` to its
// path ('/team/name.jpg'); until then a placeholder stands in.
type Person = { name: string; role: string; bio: string; photo?: string }

const BIO_TEMPLATE = 'Bio to come: background, what they work on at RegWay, and where they studied or worked before.'

const FOUNDERS: Person[] = [
  { name: 'Ulykbek Khairulla', role: 'Co-founder', bio: BIO_TEMPLATE },
  { name: 'Shivang Chalise', role: 'Co-founder', bio: BIO_TEMPLATE },
]

const CODIFY = {
  name: 'UC Berkeley Codify',
  bio: 'Description to come: who the Codify team are, how they work with RegWay, and what they have built.',
  photo: undefined as string | undefined,
}

// Codify members shown under the team's description; empty until the team
// sends names, roles and bios.
const CODIFY_MEMBERS: Person[] = []

function Portrait({ photo, name, group = false }: { photo?: string; name: string; group?: boolean }) {
  if (photo) return <img src={photo} alt={name} className="tile w-16 h-16 object-cover" />
  const Icon = group ? UsersThree : User
  return (
    <div className="tile w-16 h-16" role="img" aria-label={`${name}: photo to come`}>
      <Icon size={28} aria-hidden="true" style={{ color: 'var(--text-300)' }} />
    </div>
  )
}

function Bio({ text }: { text: string }) {
  const template = text === BIO_TEMPLATE || text === CODIFY.bio
  return (
    <p className="text-[14px] leading-relaxed mt-2" style={{ color: template ? 'var(--text-300)' : 'var(--text-600)', fontStyle: template ? 'italic' : undefined }}>
      {text}
    </p>
  )
}

function PersonCard({ person }: { person: Person }) {
  return (
    <li className="glass-card p-5 flex gap-4 items-start">
      <Portrait photo={person.photo} name={person.name} />
      <div className="min-w-0">
        <p className="font-semibold text-[15px]" style={{ color: 'var(--text-900)', letterSpacing: '-0.01em' }}>{person.name}</p>
        <p className="text-[13px]" style={{ color: 'var(--text-400)' }}>{person.role}</p>
        <Bio text={person.bio} />
      </div>
    </li>
  )
}

function Team() {
  return (
    <section className="mt-14" aria-labelledby="team">
      <h2 id="team" className="text-[22px] font-semibold" style={{ color: 'var(--text-900)', letterSpacing: '-0.025em' }}>The team</h2>
      <h3 className="section-label mt-6 mb-3">Founders</h3>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FOUNDERS.map(person => (
          <PersonCard key={person.name} person={person} />
        ))}
      </ul>
      <h3 className="section-label mt-8 mb-3">Engineering</h3>
      <div className="glass-card p-5">
        <div className="flex gap-4 items-start">
          <Portrait photo={CODIFY.photo} name={CODIFY.name} group />
          <div className="min-w-0">
            <p className="font-semibold text-[15px]" style={{ color: 'var(--text-900)', letterSpacing: '-0.01em' }}>{CODIFY.name}</p>
            <p className="text-[13px]" style={{ color: 'var(--text-400)' }}>Student engineering team</p>
            <Bio text={CODIFY.bio} />
          </div>
        </div>
        {CODIFY_MEMBERS.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mt-6 pt-5" style={{ borderTop: '1px solid rgb(var(--line-rgb) / 0.3)' }}>
            {CODIFY_MEMBERS.map(person => (
              <li key={person.name} className="flex gap-3 items-center">
                {person.photo ? (
                  <img src={person.photo} alt={person.name} className="tile w-10 h-10 object-cover" />
                ) : (
                  <div className="tile w-10 h-10" role="img" aria-label={`${person.name}: photo to come`}>
                    <User size={18} aria-hidden="true" style={{ color: 'var(--text-300)' }} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[14px] font-medium" style={{ color: 'var(--text-900)' }}>{person.name}</p>
                  <p className="text-[13px]" style={{ color: 'var(--text-400)' }}>{person.role}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
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
        <ol className="info-steps">
          {[
            {
              title: 'You describe the firm.',
              text: 'Where the firm, its funds and its portfolio companies are, what they do, and which fund holds which company. You can finish it later; a blank answer is treated as unknown, never as “no”.',
            },
            {
              title: 'RegWay reads the official sources.',
              text: (
                <>
                Regulators' own publications in the United States, the United Kingdom and the European Union, plus a targeted web search for each portfolio company. The full list is on the <RouteLink className="link" to="/sources">Sources</RouteLink> page.
              </>
            ),
          },
          {
            title: 'You see what applies, and why.',
            text: 'Each development on your dashboard carries the reason it is there, a link to the official document, and an analysis written for your firm. If a match looks wrong you can ask for it to be re-checked or dismiss it.',
          },
          ].map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span className="num font-mono text-[13px] pt-[3px]" style={{ color: 'var(--primary)' }}>{String(i + 1).padStart(2, '0')}</span>
            <div>
              <strong>{step.title}</strong> {step.text}
            </div>
          </li>
          ))}
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
      <Team />
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
  const clauses: Clause[] = [
    {
      id: 'not-legal-advice',
      title: 'Not legal advice',
      body: (
        <>
          <p>
            The developments, reasons, analyses and chat answers in RegWay are provided for general information. They do not create an attorney-client relationship, and they are not a substitute for advice from qualified counsel who knows your circumstances.
          </p>
        </>
      ),
    },
    {
      id: 'written-by-ai',
      title: 'Written by AI',
      body: (
        <>
          <p>
            Relevance decisions, analyses and chat answers are written by an AI model. They can contain mistakes: a rule can be described incorrectly, a proposed rule can be mistaken for a final one, a deadline can be wrong, and a development can be matched to a firm or company it does not apply to. Always read the official document, which is linked from every development, before relying on anything RegWay says about it.
          </p>
        </>
      ),
    },
    {
      id: 'depends-on-what-you-tell-it',
      title: 'Depends on what you tell it',
      body: (
        <>
          <p>
            RegWay matches developments against the profile you enter for your firm, funds and portfolio companies. If that information is incomplete or out of date, relevant developments can be missed and irrelevant ones shown.
          </p>
        </>
      ),
    },
    {
      id: 'not-complete-and-not-always-current',
      title: 'Not complete, and not always current',
      body: (
        <>
          <p>
            RegWay reads a fixed list of sources, described on the <RouteLink className="link" to="/sources">Sources</RouteLink> page, and does not cover every regulator or jurisdiction. Sources are read on a schedule, so a development can appear here some time after it is published, and a source can be temporarily unavailable.
          </p>
        </>
      ),
    },
    {
      id: 'your-decisions-are-yours',
      title: 'Your decisions are yours',
      body: (
        <>
          <p>
            RegWay describes obligations and dates; it does not tell you what to do, and it does not rank how urgent something is for you. Compliance decisions remain the responsibility of you and your advisers.
          </p>
        </>
      ),
    },
  ]
  return <DocumentBody lead="RegWay is an information tool. It is not a law firm and nothing in it is legal advice." clauses={clauses} />
}

function Privacy() {
  const clauses: Clause[] = [
    {
      id: 'what-regway-stores',
      title: 'What RegWay stores',
      body: (
        <>
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
        </>
      ),
    },
    {
      id: 'what-it-is-used-for',
      title: 'What it is used for',
      body: (
        <>
          <p>
            To decide which developments are relevant to your firm, to write the analysis of each, to answer your questions, and to keep your account working. RegWay does not sell your information and does not use it for advertising.
          </p>
        </>
      ),
    },
    {
      id: 'who-else-handles-it',
      title: 'Who else handles it',
      body: (
        <>
          <p>RegWay runs on services provided by other companies, which process information on its behalf:</p>
          <ul>
            <li>a hosting provider, which serves the website;</li>
            <li>a database and sign-in provider, which stores the information listed above;</li>
            <li>
              an AI model provider. To match developments, write analyses and answer chat questions, the relevant parts of your firm's profile, your question and any file attached to it are sent to this provider.
            </li>
          </ul>
          <p>Your firm's information is visible only to members of your firm's account.</p>
        </>
      ),
    },
    {
      id: 'in-your-browser',
      title: 'In your browser',
      body: (
        <>
          <p>
            RegWay keeps your sign-in session, your light or dark preference and a copy of recently viewed data in your browser's storage so pages open quickly. This copy is cleared when you sign out. RegWay does not use advertising or third-party analytics trackers.
          </p>
        </>
      ),
    },
    {
      id: 'your-choices',
      title: 'Your choices',
      body: (
        <>
          <ul>
            <li>You can change your name, email, password and every profile answer in Profile.</li>
            <li>You can delete any saved conversation from the chat's sidebar.</li>
            <li>You can remove a fund or portfolio company, which deletes its profile.</li>
          </ul>
        </>
      ),
    },
  ]
  return <DocumentBody lead="What RegWay stores about you and your firm, what it is used for, and who else handles it." clauses={clauses} />
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
        <div className="max-w-[960px] mx-auto">
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
            <p className="text-[13px] mt-3" style={{ color: 'var(--text-400)' }}>
              Last updated <span className="num">{UPDATED}</span>
            </p>
          )}
          <div className={slug === 'legal' || slug === 'privacy' ? 'mt-8' : 'mt-6 max-w-2xl'}>
            <Body />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
