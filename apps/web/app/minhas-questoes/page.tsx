import { redirect } from "next/navigation";

export const metadata = { title: "Minhas questões" };
export default function MyProblemsPage() {
  redirect("/studio?section=mine");
}
