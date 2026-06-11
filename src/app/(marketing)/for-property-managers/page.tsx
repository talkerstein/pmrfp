import type { Metadata } from "next";
import { ForPmV2 } from "@/components/v2/for-pm-v2";

export const metadata: Metadata = {
  title: "For Property Managers, Builders & Owners",
  description:
    "Post your building project free, and compare the trades that bid — by category and region. No obligation to hire.",
};

export default function ForPropertyManagersPage() {
  return <ForPmV2 />;
}
