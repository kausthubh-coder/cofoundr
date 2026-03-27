"use client";

import Link from "next/link";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignInButton, UserButton } from "@clerk/nextjs";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="brand-mark">
        COFOUNDR
      </Link>
      <Authenticated>
        <nav className="site-nav">
          <Link href="/register">Register</Link>
          <Link href="/app">Dashboard</Link>
          <UserButton />
        </nav>
      </Authenticated>
      <Unauthenticated>
        <SignInButton mode="modal" forceRedirectUrl="/register">
          <button className="site-header-cta" type="button">
            Sign In
          </button>
        </SignInButton>
      </Unauthenticated>
    </header>
  );
}
