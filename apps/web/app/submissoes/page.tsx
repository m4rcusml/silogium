import { redirect } from "next/navigation";

export const metadata = { title: "Submissões" };
export default function SubmissionsPage() {
  redirect("/explorar?view=activity");
}
