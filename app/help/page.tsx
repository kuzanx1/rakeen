import type { Metadata } from "next";
import HelpPage from "./HelpPage";

export const metadata: Metadata = {
  title: "مركز المساعدة | ركين",
  description: "شرح مباشر لكل شاشة بنظام ركين — نفس الشاشة اللي راح تشوفها بالضبط.",
};

export default function Page() {
  return <HelpPage />;
}
