"use client"

import { useEffect, useState } from "react"
import { ShaderAnimation } from "@/components/ShaderAnimation"
import { AnimateOnScroll } from "@/components/AnimateOnScroll"
import { trackEvent } from "@/components/GA4Provider"

const MIN_LOADER_DISPLAY_MS = 2200

const PROBLEM_CARDS = [
  {
    icon: "📅",
    title: "Visit After Visit, Cancelled",
    body: "Last-minute 'emergencies.' Vague excuses. Your time stolen—and no proof it's happening.",
  },
  {
    icon: "💬",
    title: "Your Messages Go Unanswered",
    body: "Calls blocked. Texts ignored. You're painted as the problem—but who's documenting the silence?",
  },
  {
    icon: "⚖️",
    title: "Courts Need Evidence, Not Stories",
    body: "Judges don't care who's 'right.' They care who can prove it. You're losing because you can't show the pattern.",
  },
]

const HOW_IT_WORKS = [
  {
    icon: "📸",
    title: "Upload",
    body: "Screenshot texts, forward emails, sync your calendar. We handle the rest.",
  },
  {
    icon: "🤖",
    title: "AI Analyzes",
    body: "Our system detects patterns, scores severity, flags alienation tactics.",
  },
  {
    icon: "📄",
    title: "Get Proof",
    body: "Court-ready reports. Case law matches. Response strategies that judges respect.",
  },
  {
    icon: "👨‍👧",
    title: "Win Back Time",
    body: "Present evidence your attorney can use. Increase custody. Restore your relationship.",
  },
]

const FAQ_ITEMS = [
  {
    q: "Will this make me look aggressive in court?",
    a: "No. The tool coaches you to stay cooperative while documenting refusals. Judges reward the parent who tried—this proves you did.",
  },
  {
    q: "What if my ex finds out I'm using this?",
    a: "Your data is encrypted. You control what gets shared. Many users never mention the tool—they just bring better evidence.",
  },
  {
    q: "Can I use this if I don't have a lawyer yet?",
    a: "Yes. The reports are designed to help you find the right attorney and reduce billable hours by arriving organized.",
  },
]

export default function LandingPage() {
  const [loaded, setLoaded] = useState(false)
  const [contentVisible, setContentVisible] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoaded(true)
      trackEvent("page_loaded", { loaded_after_ms: MIN_LOADER_DISPLAY_MS })
    }, MIN_LOADER_DISPLAY_MS)

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!loaded) return
    const timer = setTimeout(() => setContentVisible(true), 100)
    return () => clearTimeout(timer)
  }, [loaded])

  const handleCtaClick = (location: string, label: string) => {
    trackEvent("cta_click", { cta_location: location, cta_label: label })
  }

  return (
    <>
      {/* Loading state: full-screen shader */}
      <div
        className="loading-overlay"
        data-loaded={loaded}
        role="progressbar"
        aria-label="Loading"
        aria-valuetext="Loading"
      >
        <ShaderAnimation />
        <span className="loader-brand">BitterBM.com</span>
      </div>

      <main
        className="landing-content"
        data-visible={contentVisible}
        data-ga4-section="landing"
      >
        <article>
          {/* HERO */}
          <header className="section" role="banner">
            <div className="container">
              <h1>
                Prove Parental Alienation—Document Every Denied Visit
              </h1>
              <p>
                Leverage the latest AI Models Trained and Family Court Data to
                Generate Strategy to Ensure The Best Outcome for Your Kids
              </p>
              <a
                href="#assessment"
                className="btn-primary"
                data-ga4-cta="hero_stop_the_alienation_now"
                onClick={() =>
                  handleCtaClick("hero", "stop_the_alienation_now")
                }
              >
                Stop The Alienation Now
              </a>
            </div>
          </header>

          {/* Social Proof Bar - micro-animated badges */}
          <section
            className="social-proof-bar"
            aria-label="Trust signals"
            data-ga4-section="social_proof"
          >
            <span
              className="badge"
              style={{ animationDelay: "0ms" }}
            >
              ✓ No credit card
            </span>
            <span
              className="badge"
              style={{ animationDelay: "100ms" }}
            >
              ✓ 30-day analysis free
            </span>
            <span
              className="badge"
              style={{ animationDelay: "200ms" }}
            >
              ✓ 2,847 parents protected
            </span>
          </section>

          {/* Problem Agitation - scroll-triggered, staggered */}
          <section
            className="section"
            aria-labelledby="problem-heading"
            data-ga4-section="problem_agitation"
          >
            <div className="container">
              <AnimateOnScroll>
                <h2 id="problem-heading" style={{ marginBottom: "var(--space-2xl)" }}>
                  You Know What&apos;s Happening. The Court Doesn&apos;t.
                </h2>
              </AnimateOnScroll>
              <div
                className="problem-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: "var(--space-lg)",
                }}
              >
                {PROBLEM_CARDS.map((card, i) => (
                  <AnimateOnScroll key={card.title} stagger={(i + 1) as 1 | 2 | 3}>
                    <div
                      className="problem-card"
                      style={{
                        padding: "var(--space-xl)",
                        background: "var(--bg-card)",
                        borderRadius: "12px",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span
                        className="icon-pulse"
                        style={{
                          display: "inline-block",
                          fontSize: "1.5rem",
                          marginBottom: "var(--space-md)",
                        }}
                      >
                        {card.icon}
                      </span>
                      <h3
                        style={{
                          fontSize: "1.125rem",
                          fontWeight: 600,
                          marginBottom: "var(--space-sm)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {card.title}
                      </h3>
                      <p style={{ marginBottom: 0, fontSize: "0.9375rem" }}>
                        {card.body}
                      </p>
                    </div>
                  </AnimateOnScroll>
                ))}
              </div>
            </div>
          </section>

          {/* How It Works - 4 steps with animated reveal */}
          <section
            className="section"
            aria-labelledby="how-it-works-heading"
            data-ga4-section="how_it_works"
          >
            <div className="container">
              <AnimateOnScroll>
                <h2 id="how-it-works-heading" style={{ marginBottom: "var(--space-2xl)" }}>
                  How It Works
                </h2>
              </AnimateOnScroll>
              <div
                className="steps-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: "var(--space-xl)",
                }}
              >
                {HOW_IT_WORKS.map((step, i) => (
                  <AnimateOnScroll key={step.title} stagger={(i + 1) as 1 | 2 | 3 | 4}>
                    <div
                      className="step-connector step-revealed"
                      style={{
                        display: "flex",
                        gap: "var(--space-lg)",
                        alignItems: "flex-start",
                      }}
                    >
                      <span
                        className="icon-pulse"
                        style={{
                          flexShrink: 0,
                          fontSize: "1.75rem",
                          opacity: 0.9,
                        }}
                      >
                        {step.icon}
                      </span>
                      <div>
                        <h3
                          style={{
                            fontSize: "1.125rem",
                            fontWeight: 600,
                            marginBottom: "var(--space-xs)",
                            color: "var(--text-primary)",
                          }}
                        >
                          {step.title}
                        </h3>
                        <p style={{ margin: 0, fontSize: "0.9375rem" }}>
                          {step.body}
                        </p>
                      </div>
                    </div>
                  </AnimateOnScroll>
                ))}
              </div>
            </div>
          </section>

          {/* AI Benefits - Differentiator Section */}
          <section
            className="section ai-benefits-section"
            aria-labelledby="ai-benefits-heading"
            data-ga4-section="ai_benefits"
          >
            <div className="container">
              <AnimateOnScroll>
                <span
                  className="icon-pulse"
                  style={{
                    display: "inline-block",
                    fontSize: "2rem",
                    marginBottom: "var(--space-md)",
                  }}
                >
                  🤖
                </span>
                <h2 id="ai-benefits-heading" style={{ marginBottom: "var(--space-md)" }}>
                  AI That Matches Your Case to Winning Precedents
                </h2>
                <p style={{ marginBottom: "var(--space-lg)", maxWidth: "52ch" }}>
                  Our AI analyzes your communication patterns and matches them to
                  similar custody cases where alienation was proven—resulting in
                  penalties ranging from <strong>contempt of court</strong> to
                  alienators <strong>losing custody</strong> and being forced to
                  pay child support and legal fees.
                </p>
                <p
                  style={{
                    marginBottom: "var(--space-xl)",
                    fontSize: "0.9375rem",
                    color: "var(--accent-muted)",
                  }}
                >
                  Built by a team of loving parents (Lawyers, Engineers, Tech
                  Founders) who have ALL successfully protected our children
                  from parental alienation—We spent hundreds of thousands of
                  dollars fighting for our children and have now trained AI so
                  you don&apos;t have to.
                </p>
                <a
                  href="#assessment"
                  className="btn-primary"
                  data-ga4-cta="ai_benefits_match_case"
                  onClick={() => handleCtaClick("ai_benefits", "match_your_case")}
                >
                  See How AI Can Build Your Case
                </a>
              </AnimateOnScroll>
            </div>
          </section>

          {/* CTA Block */}
          <section
            className="section-sm"
            aria-labelledby="cta-block-heading"
            data-ga4-section="cta_block"
          >
            <div className="container">
              <AnimateOnScroll>
                <h2 id="cta-block-heading" style={{ marginBottom: "var(--space-md)" }}>
                  Start Documenting Free
                </h2>
                <p style={{ marginBottom: "var(--space-xl)" }}>
                  Upload your first evidence in under 2 minutes. No card required.
                </p>
                <a
                  href="#assessment"
                  className="btn-primary"
                  data-ga4-cta="cta_block_start_free"
                  onClick={() => handleCtaClick("cta_block", "start_free")}
                >
                  Start Documenting Free
                </a>
              </AnimateOnScroll>
            </div>
          </section>

          {/* Pricing - simplified */}
          <section
            className="section"
            aria-labelledby="pricing-heading"
            data-ga4-section="pricing"
          >
            <div className="container">
              <AnimateOnScroll>
                <h2 id="pricing-heading" style={{ marginBottom: "var(--space-2xl)" }}>
                  Simple, Transparent Pricing
                </h2>
              </AnimateOnScroll>
              <div
                className="pricing-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: "var(--space-lg)",
                }}
              >
                <AnimateOnScroll stagger={1}>
                  <div
                    className="pricing-card"
                    style={{
                      padding: "var(--space-xl)",
                      background: "var(--bg-card)",
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <h3 style={{ fontSize: "1.25rem", marginBottom: "var(--space-sm)", color: "var(--text-primary)" }}>
                      Free Assessment
                    </h3>
                    <p style={{ marginBottom: "var(--space-md)", fontSize: "0.9375rem" }}>
                      Upload 30 days · Basic pattern analysis · Preview severity score
                    </p>
                    <a
                      href="#assessment"
                      className="btn-primary"
                      onClick={() => handleCtaClick("pricing", "start_free")}
                    >
                      Start Free
                    </a>
                  </div>
                </AnimateOnScroll>
                <AnimateOnScroll stagger={2}>
                  <div
                    className="pricing-card"
                    style={{
                      padding: "var(--space-xl)",
                      background: "var(--bg-card)",
                      borderRadius: "12px",
                      border: "1px solid var(--accent-primary)",
                      boxShadow: "0 0 0 1px var(--accent-glow)",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                        color: "var(--accent-muted)",
                        marginBottom: "var(--space-sm)",
                      }}
                    >
                      Most Flexible
                    </span>
                    <h3 style={{ fontSize: "1.25rem", marginBottom: "var(--space-sm)", color: "var(--text-primary)" }}>
                      $39/month
                    </h3>
                    <p style={{ marginBottom: "var(--space-md)", fontSize: "0.9375rem" }}>
                      Unlimited uploads · Full court reports · Case law matching
                    </p>
                    <a
                      href="#assessment"
                      className="btn-primary"
                      onClick={() => handleCtaClick("pricing", "begin_monthly")}
                    >
                      Begin Documenting
                    </a>
                  </div>
                </AnimateOnScroll>
                <AnimateOnScroll stagger={3}>
                  <div
                    className="pricing-card"
                    style={{
                      padding: "var(--space-xl)",
                      background: "var(--bg-card)",
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                        color: "var(--accent-gold)",
                        marginBottom: "var(--space-sm)",
                      }}
                    >
                      Best Value
                    </span>
                    <h3 style={{ fontSize: "1.25rem", marginBottom: "var(--space-sm)", color: "var(--text-primary)" }}>
                      $599 flat fee
                    </h3>
                    <p style={{ marginBottom: "var(--space-md)", fontSize: "0.9375rem" }}>
                      Everything + priority support · Valid until case settles
                    </p>
                    <a
                      href="#assessment"
                      className="btn-primary"
                      onClick={() => handleCtaClick("pricing", "protect_rights")}
                    >
                      Protect Your Rights
                    </a>
                  </div>
                </AnimateOnScroll>
              </div>
            </div>
          </section>

          {/* FAQ Accordion */}
          <section
            className="section"
            aria-labelledby="faq-heading"
            data-ga4-section="faq"
          >
            <div className="container">
              <AnimateOnScroll>
                <h2 id="faq-heading" style={{ marginBottom: "var(--space-xl)" }}>
                  Common Questions
                </h2>
              </AnimateOnScroll>
              <div style={{ maxWidth: "640px" }}>
                {FAQ_ITEMS.map((item, i) => (
                  <AnimateOnScroll key={i} stagger={(i + 1) as 1 | 2 | 3}>
                    <div
                      className="faq-item"
                      data-expanded={expandedFaq === i}
                    >
                      <button
                        type="button"
                        className="faq-trigger"
                        onClick={() => {
                          setExpandedFaq(expandedFaq === i ? null : i)
                          trackEvent("faq_expand", { question_index: i })
                        }}
                        aria-expanded={expandedFaq === i}
                        aria-controls={`faq-${i}`}
                        id={`faq-trigger-${i}`}
                      >
                        {item.q}
                        <span className="chevron" aria-hidden>▼</span>
                      </button>
                      <div
                        id={`faq-${i}`}
                        className="faq-content"
                        role="region"
                        aria-labelledby={`faq-trigger-${i}`}
                      >
                        <div className="faq-content-inner">{item.a}</div>
                      </div>
                    </div>
                  </AnimateOnScroll>
                ))}
              </div>
            </div>
          </section>

          {/* Final CTA Banner */}
          <section
            className="section final-cta-banner"
            aria-labelledby="final-cta-heading"
            data-ga4-section="final_cta"
          >
            <div className="container">
              <AnimateOnScroll>
                <h2 id="final-cta-heading" style={{ marginBottom: "var(--space-md)" }}>
                  Your Child Is Waiting. Start Building Your Case Tonight.
                </h2>
                <p style={{ marginBottom: "var(--space-xl)" }}>
                  Every day without documentation weakens your case.
                </p>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-md)",
                  }}
                >
                  <a
                    href="#assessment"
                    className="btn-primary"
                    onClick={() => handleCtaClick("final_cta", "upload_first_evidence")}
                  >
                    Upload First Evidence
                  </a>
                  <a
                    href="#assessment"
                    style={{
                      display: "inline-flex",
                      justifyContent: "center",
                      padding: "var(--space-md)",
                      color: "var(--accent-muted)",
                      fontSize: "0.9375rem",
                      textDecoration: "none",
                      border: "1px solid var(--border-accent)",
                      borderRadius: "8px",
                      transition: "border-color 0.2s, color 0.2s",
                    }}
                    onClick={() => handleCtaClick("final_cta", "talk_to_team")}
                  >
                    Talk to Our Team
                  </a>
                </div>
                <p
                  style={{
                    marginTop: "var(--space-xl)",
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                  }}
                >
                  🔒 Bank-level encryption · No data sold · Delete anytime
                </p>
              </AnimateOnScroll>
            </div>
          </section>
        </article>

        {/* Sticky CTA Bar - mobile-first, always visible */}
        <div
          className="sticky-cta-bar"
          data-ga4-section="sticky_cta"
          role="complementary"
        >
          <a
            href="#assessment"
            className="btn-primary"
            style={{ width: "100%", maxWidth: "400px", margin: "0 auto" }}
            onClick={() => handleCtaClick("sticky_cta", "stop_the_alienation_now")}
          >
            Stop The Alienation Now
          </a>
        </div>
      </main>
    </>
  )
}
