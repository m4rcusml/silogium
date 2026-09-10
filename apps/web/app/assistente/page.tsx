import { redirect } from "next/navigation";

export const metadata = { title: "Assistente" };
export default function AssistantPage() {
  redirect("/studio");
}
