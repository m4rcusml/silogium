import { MyProblems } from "../../components/my-problems";

export const metadata = { title: "Minhas questões" };
export default function MyProblemsPage() {
  return <main className="container page"><span className="eyebrow">Autoria</span><h1 style={{ fontSize: 46 }}>Minhas questões</h1><MyProblems /></main>;
}
