import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

const handleItems = [
  {
    label: "Deadlines",
    title: "Every deadline, tracked",
    body: "Option period, financing, inspection, appraisal, closing. Nothing slips.",
    image: "/landing/deadline-desk.jpg",
    alt: "A contract and calendar on a warm sunlit desk."
  },
  {
    label: "File",
    title: "The file stays clean",
    body: "Contracts, amendments, disclosures, broker requirements. Filed before they become a scramble.",
    image: "/landing/file-documents.jpg",
    alt: "Organized real estate folders with signed paperwork."
  },
  {
    label: "Follow-up",
    title: "Open items get chased",
    body: "Title, lender, co-op agent, inspector. Stephanie keeps open items moving before you become the bottleneck.",
    image: "/landing/title-table.jpg",
    alt: "A quiet closing table with paperwork, pens, and house keys."
  },
  {
    label: "Closing",
    title: "Closing stays calm",
    body: "CDA, final walkthrough, funding, keys. The last mile stays calm.",
    image: "/landing/broker-file.jpg",
    alt: "A broker file and checklist on a tidy office desk."
  }
];

const faqs = [
  {
    question: "What is Stephanie?",
    answer:
      "Stephanie is an AI transaction coordinator built to work the way the best human TCs do. She has her own email, her own process, and she is yours from day one."
  },
  {
    question: "Does she talk to my clients?",
    answer:
      "Only if you want her to. By default, she works behind the scenes with title, lender, and the co-op agent. You stay in front of your clients."
  },
  {
    question: "What happens if she gets something wrong?",
    answer:
      "She always asks before sending anything important. Every action lives in an email trail, and our team can step in if needed."
  },
  {
    question: "How does she handle compliance?",
    answer:
      "Every transaction has an audit trail. Documents are retained per state and broker rules. She follows your brokerage's guidelines."
  },
  {
    question: "What states does she work in?",
    answer: "[Texas at launch. Add others as they roll out.]"
  },
  {
    question: "Can I rename her?",
    answer:
      "Renaming is coming soon. For now, every agent's TC is named Stephanie."
  },
  {
    question: "Is this an AI product?",
    answer:
      "Yes. Stephanie is built on advanced AI designed to behave like a senior TC. We are transparent about it because the work speaks for itself."
  }
];

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="landing-page">
      <header className="landing-nav" aria-label="Main navigation">
        <Link className="brand-mark" href="/">
          <span className="brand-symbol" aria-hidden="true">
            S
          </span>
          <span>[COMPANY_NAME]</span>
        </Link>
        <nav className="nav-actions" aria-label="Primary">
          <Link className="nav-link" href="/login">
            Login
          </Link>
          <Link className="pill-button dark" href="/signup">
            Hire Stephanie
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-image-wrap">
          <img
            src="/landing/hero-keys.jpg"
            alt="House keys, a contract, and morning coffee on a kitchen counter."
            className="hero-image"
            fetchPriority="high"
            height="887"
            width="1774"
          />
        </div>
        <div className="hero-copy">
          <p className="small-kicker">Meet Stephanie</p>
          <h1>Meet Stephanie. Your transaction coordinator.</h1>
          <p>
            Send her the contract. She takes it from there. You stay with your
            clients.
          </p>
          <div className="hero-actions">
            <Link className="pill-button dark" href="/signup">
              Hire Stephanie
            </Link>
            <a className="pill-button quiet" href="#how-it-works">
              See how it works
            </a>
          </div>
        </div>
      </section>

      <section className="landing-section email-section" id="email-interface">
        <div className="section-heading centered">
          <p className="small-kicker">Her own address</p>
          <h2>Every agent gets their own Stephanie. With her own email.</h2>
        </div>
        <EmailCard
          meta={[
            "From: Stephanie Park <stephanie.park@[COMPANY_DOMAIN].com>",
            "To: [agent]",
            "Subject: Hi [agent], I am your TC"
          ]}
        >
          <p>Welcome aboard. I am Stephanie, your transaction coordinator.</p>
          <p>
            When you have a contract ready, just forward it to me at this
            address. I will handle the timelines, the paperwork, and the back
            and forth with title, lender, and the co-op agent.
          </p>
          <p>
            I will keep you posted, and I will always check with you before I
            send anything on your behalf.
          </p>
          <p>Looking forward to working with you,</p>
          <p>Stephanie</p>
        </EmailCard>
        <p className="interface-line">That is the whole interface.</p>
      </section>

      <section className="landing-section" id="how-it-works">
        <div className="section-heading">
          <p className="small-kicker">How it works</p>
          <h2>It works like hiring any other TC. Just faster.</h2>
        </div>
        <div className="step-grid">
          <StepCard
            number="01"
            title="You sign up. Stephanie introduces herself."
            body="Her first email arrives within a minute. You have a TC."
          />
          <StepCard
            number="02"
            title="You forward her a contract."
            body="She reads it, builds the file, sets every deadline, and starts the work."
          />
          <StepCard
            number="03"
            title="You stay in the loop."
            body="She emails you updates. When she needs your sign-off, she asks. You reply yes. Done."
          />
        </div>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <p className="small-kicker">What she handles</p>
          <h2>What Stephanie handles for you.</h2>
        </div>
        <div className="handle-grid">
          {handleItems.map((item) => (
            <article className="handle-card" key={item.title}>
              <img
                src={item.image}
                alt={item.alt}
                height="1024"
                loading="lazy"
                width="1536"
              />
              <span className="handle-label">{item.label}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section approval-section">
        <div className="section-heading centered">
          <p className="small-kicker">Approval flow</p>
          <h2>You stay in control. Always.</h2>
        </div>
        <div className="approval-thread">
          <EmailCard compact sender="Stephanie">
            <p>
              Drafted this for Carla at First American to confirm the title
              commitment timing. Okay to send?
            </p>
            <div className="email-preview">
              <p>Carla, can you confirm timing on the title commitment?</p>
              <p>
                My agent has inspection scheduled and wants to keep the file
                moving cleanly.
              </p>
              <p>Thank you,</p>
              <p>Stephanie</p>
            </div>
            <p>Reply yes to send, or tell me what to change.</p>
          </EmailCard>
          <div className="agent-reply">Agent: Yes, send it.</div>
          <div className="stephanie-reply">
            Stephanie: Sent. I will let you know when she replies.
          </div>
        </div>
        <p className="interface-line">Nothing important goes out without you.</p>
      </section>

      <section className="landing-section not-section">
        <h2>What Stephanie is not.</h2>
        <div className="not-lines" aria-label="What Stephanie is not">
          <p>Not another place to check.</p>
          <p>Not another login.</p>
          <p>Not a chatbot.</p>
          <p>Not in front of your clients.</p>
        </div>
        <p className="not-resolution">Just your TC. Just an email away.</p>
      </section>

      <section className="landing-section promise-section">
        <p>
          You did not get into real estate to chase signatures, watch
          deadlines, or keep title companies on schedule. You got in for the
          people. For the keys-on-the-counter moment.
        </p>
        <p>
          A great TC gives you that back. But hiring one is expensive, and most
          agents end up doing the work themselves at 11pm anyway.
        </p>
        <p>
          Stephanie is the TC every agent should have. She works the way the
          best TCs work, just faster, and she is there from day one. She handles
          the file. You handle the people.
        </p>
      </section>

      <section className="landing-section pricing-section">
        <div className="section-heading centered">
          <p className="small-kicker">Pricing</p>
          <h2>Less than a human TC. More responsive. Same job.</h2>
        </div>
        <div className="price-card">
          <p className="price-label">Per transaction</p>
          <p className="price">$99.99</p>
          <p>
            Human TCs often cost $250 to $500 per transaction. Stephanie does
            the same job for a simple file-by-file price.
          </p>
          <Link className="pill-button dark" href="/signup">
            Hire Stephanie
          </Link>
        </div>
      </section>

      <section className="landing-section faq-section">
        <div className="section-heading">
          <p className="small-kicker">FAQ</p>
          <h2>Questions agents ask before hiring Stephanie.</h2>
        </div>
        <div className="faq-list">
          {faqs.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="final-cta">
        <h2>Ready to hire Stephanie?</h2>
        <Link className="pill-button dark" href="/signup">
          Hire Stephanie
        </Link>
      </section>
    </main>
  );
}

function StepCard({
  number,
  title,
  body
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <article className="step-card">
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function EmailCard({
  children,
  compact = false,
  meta,
  sender
}: {
  children: React.ReactNode;
  compact?: boolean;
  meta?: string[];
  sender?: string;
}) {
  return (
    <article className={compact ? "email-card compact-email" : "email-card"}>
      {sender ? <p className="email-sender">{sender}</p> : null}
      {meta ? (
        <div className="email-meta">
          {meta.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ) : null}
      <div className="email-body">{children}</div>
    </article>
  );
}
