import { SubmissionHistory } from "@/components/submission-history";

export const metadata = { title: "Submissões" };
export default function SubmissionsPage() {
  return <main className="container page"><span className="eyebrow">Histórico</span><h1 style={{ fontSize: 46 }}>Submissões</h1><p className="lead">Execuções do navegador e submissões da CLI ficam reunidas aqui.</p><SubmissionHistory /></main>;
}
