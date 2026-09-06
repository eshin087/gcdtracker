import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { SavedList } from "./SavedList";

export const metadata: Metadata = {
  title: "Saved",
  description: "Evidence you bookmarked on gcdTracker, stored only in this browser.",
};

export default function SavedPage() {
  return (
    <div className="shell explorer">
      <PageHeader title="Saved" sub="Records you bookmarked with the ⌂ icon. They stay in this browser only, with their source links, so you can return to them even after they leave our retention window." />
      <SavedList />
    </div>
  );
}
