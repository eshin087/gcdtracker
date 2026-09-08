import { notFound, redirect } from "next/navigation";

export default async function RetiredVisitorsPage({ params }: { params: Promise<{ view?: string[] }> }) {
  const { view = [] } = await params;
  if (view.length > 1 || (view[0] && !["day", "agents", "recent", "violations"].includes(view[0]))) notFound();
  redirect("/traffic");
}
