import type { Metadata } from "next";
import AdminDashboard from "./AdminDashboard";

export const metadata: Metadata = {
  title: "لوحة إدارة ركين",
};

export default function AdminPage() {
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@600;700&display=swap" />
      <AdminDashboard />
    </>
  );
}
