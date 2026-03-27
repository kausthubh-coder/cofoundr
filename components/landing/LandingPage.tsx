"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

const MARQUEE_ITEMS = [
  "Built for Builders",
  "Real Income",
  "No Random Networking",
  "Curated Matches",
  "Build Fast",
  "Build Better",
];

export default function LandingPage() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            setTimeout(() => entry.target.classList.add("vis"), i * 80);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );

    root.querySelectorAll(".sr").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="grid-wrap" ref={wrapRef}>
      {/* ── Nav ── */}
      <div className="row nav-row">
        <div className="cell nav-logo">COFOUNDR</div>
        <div className="cell nav-mid">
          Curated Cofounder Matching&nbsp;&middot;&nbsp;Est.&nbsp;2026
        </div>
        <SignedIn>
          <Link href="/register" className="cell nav-cta">
            Get Started&nbsp;&rarr;
          </Link>
        </SignedIn>
        <SignedOut>
          <SignInButton
            mode="modal"
            forceRedirectUrl="/register"
            signUpForceRedirectUrl="/register"
          >
            <button className="cell nav-cta" type="button">
              Register&nbsp;&rarr;
            </button>
          </SignInButton>
        </SignedOut>
      </div>

      {/* ── Hero ── */}
      <div className="row hero-row">
        <div className="cell side-col">
          <span className="side-label">Scroll</span>
        </div>
        <div className="cell hero-center">
          <p className="h-eyebrow">A platform for serious student founders</p>
          <h1 className="h-head">
            Find Your
            <br />
            <em>Ideal</em>
            <br />
            Cofounder.
          </h1>
          <p className="h-body">
            Curated matches based on skills, vision, and commitment. No random
            networking. No cold DMs. Built for builders, not browsers.
          </p>
          <div className="hero-cta-row">
            <SignedIn>
              <Link href="/register" className="h-cta-primary">
                Get Started &rarr;
              </Link>
              <Link href="/app" className="h-cta-secondary">
                Dashboard
              </Link>
            </SignedIn>
            <SignedOut>
              <SignInButton
                mode="modal"
                forceRedirectUrl="/register"
                signUpForceRedirectUrl="/register"
              >
                <button className="h-cta-primary" type="button">
                  Register Now &rarr;
                </button>
              </SignInButton>
            </SignedOut>
          </div>
        </div>
        <div className="cell side-col">
          <span className="side-label">Cofoundr 2026</span>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="row swiss-stat-row sr">
        <div className="cell swiss-stat-cell">
          <span className="swiss-stat-num">3&rarr;1</span>
          <span className="swiss-stat-label">Problems We Solve</span>
        </div>
        <div className="cell swiss-stat-cell">
          <span className="swiss-stat-num">0</span>
          <span className="swiss-stat-label">Cold DMs Required</span>
        </div>
        <div className="cell swiss-stat-cell">
          <span className="swiss-stat-num">&infin;</span>
          <span className="swiss-stat-label">Potential if matched right</span>
        </div>
      </div>

      {/* ── Marquee ── */}
      <div className="row mq-row" aria-hidden="true">
        <div className="mq-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((text, i) => (
            <span key={i}>
              <span className="mq-item">{text}</span>
              <span className="mq-item mq-dot">&#9670;</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Problems ── */}
      <div className="row prob-row sr">
        <div className="cell prob-index">
          <span>The Problem Space</span>
        </div>
        <div className="cell prob-list">
          <div className="prob-item">
            <span className="prob-n">01</span>
            <div>
              <div className="prob-title">
                Random networking. Random results.
              </div>
              <p className="prob-body">
                LinkedIn, Discord, and college events are noisy. There&rsquo;s
                no filter for vision alignment or commitment level. Mismatched
                partnerships fall apart fast.
              </p>
            </div>
          </div>
          <div className="prob-item">
            <span className="prob-n">02</span>
            <div>
              <div className="prob-title">Skill gaps kill momentum.</div>
              <p className="prob-body">
                Solo founders stall on what they can&rsquo;t do&nbsp;&mdash;
                engineering, design, sales. Momentum dies when you hit a wall
                you can&rsquo;t climb alone.
              </p>
            </div>
          </div>
          <div className="prob-item">
            <span className="prob-n">03</span>
            <div>
              <div className="prob-title">
                Side projects stay side projects.
              </div>
              <p className="prob-body">
                Most student startups never make money because they&rsquo;re
                treated as experiments. The wrong cofounder accelerates this
                failure.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Process ── */}
      <div className="row process-row sr">
        <div className="cell process-cell">
          <span className="pc-num">Step 01</span>
          <div>
            <div className="pc-title">Create Your Account</div>
            <p className="pc-body">
              Register now. Early members receive priority matching and
              exclusive access to the founding community.
            </p>
          </div>
        </div>
        <div className="cell process-cell">
          <span className="pc-num">Step 02</span>
          <div>
            <div className="pc-title">Create Your Profile</div>
            <p className="pc-body">
              Share skills, vision, and what you&rsquo;re looking for. This
              makes curated matching possible.
            </p>
          </div>
        </div>
        <div className="cell process-cell">
          <span className="pc-num">Step 03</span>
          <div>
            <div className="pc-title">Get Matched. Build.</div>
            <p className="pc-body">
              Connect with your ideal cofounder. No cold outreach. No guessing.
              Just aligned ambition.
            </p>
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="row wl-row" id="register">
        <div className="cell wl-left sr">
          <span className="wl-label">Join the Founding Community</span>
          <h2 className="wl-head">Register&nbsp;Now.</h2>
          <div className="wl-actions">
            <SignedIn>
              <Link href="/register" className="wl-btn">
                Complete Registration <span>&rarr;</span>
              </Link>
              <Link href="/app" className="wl-btn-secondary">
                Go to Dashboard <span>&rarr;</span>
              </Link>
            </SignedIn>
            <SignedOut>
              <SignInButton
                mode="modal"
                forceRedirectUrl="/register"
                signUpForceRedirectUrl="/register"
              >
                <button className="wl-btn" type="button">
                  Register <span>&rarr;</span>
                </button>
              </SignInButton>
            </SignedOut>
            <p className="wl-caveat">
              Spots are limited. Priority access for early members.
            </p>
          </div>
        </div>
        <div className="cell wl-right sr">
          <div className="tenet">
            <div className="tenet-n">01</div>
            <div className="tenet-t">Curated, not random.</div>
          </div>
          <div className="tenet">
            <div className="tenet-n">02</div>
            <div className="tenet-t">Skills, vision, commitment.</div>
          </div>
          <div className="tenet">
            <div className="tenet-n">03</div>
            <div className="tenet-t">Real income, not side projects.</div>
          </div>
          <div className="tenet">
            <div className="tenet-n">04</div>
            <div className="tenet-t">Builders, not browsers.</div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer>
        <div className="row foot-row">
          <div className="cell foot-left">
            &copy;&nbsp;2026 Cofoundr&nbsp;&mdash;&nbsp;Pranav Akki &amp;
            Charan Dhanasekar
          </div>
          <div className="cell foot-right">
            <a href="mailto:cofounder25@gmail.com">cofounder25@gmail.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
