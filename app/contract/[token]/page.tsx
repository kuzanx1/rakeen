import type { Metadata } from "next";
import ContractSignPage from "./ContractSignPage";

export const metadata: Metadata = {
  title: "عقد الاشتراك | ركين",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ContractSignPage token={token} />;
}
