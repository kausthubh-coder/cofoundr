"use client";

import { ReactNode, useEffect, useRef } from "react";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth, useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL in your environment");
}

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function ParticipantEnsurer() {
  const { isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const ensureParticipant = useMutation(api.participants.ensureParticipant);
  const hasEnsured = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user || hasEnsured.current) return;
    hasEnsured.current = true;
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const name = user.fullName ?? user.firstName ?? email;
    ensureParticipant({ emailHint: email, nameHint: name }).catch(() => {
      hasEnsured.current = false;
    });
  }, [isAuthenticated, user, ensureParticipant]);

  return null;
}

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <ParticipantEnsurer />
      {children}
    </ConvexProviderWithClerk>
  );
}
