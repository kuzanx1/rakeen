import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignupForm from "./SignupForm";
import { SELF_SIGNUP_OPEN, startWhatsAppLink } from "@/lib/signup";

export const metadata: Metadata = {
  title: "سجّل مطعمك — ركين",
};

export default function SignupPage() {
  // Sign-up is closed for now (lib/signup.ts): starting goes through WhatsApp.
  if (!SELF_SIGNUP_OPEN) redirect(startWhatsAppLink());
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&display=swap" />
      <SignupForm />
    </>
  );
}
