import type { Metadata } from "next";
import LandingPage from "../landing-classic/LandingPage";

// The landing page as it was before the 2026-10 redesign, kept at /classic
// so the owner can compare the two. Hidden from search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Classic() {
  return <LandingPage />;
}
