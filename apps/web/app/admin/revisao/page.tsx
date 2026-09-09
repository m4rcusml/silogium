import { ReviewPanel } from "../../../components/review-panel";

export const metadata = { title: "Revisão editorial" };
export default function ReviewPage() { return <main className="container page"><span className="eyebrow">Administração</span><h1 style={{ fontSize: 46 }}>Revisão editorial</h1><p className="lead">Questões validadas ainda precisam de uma decisão humana antes de entrar no catálogo.</p><ReviewPanel /></main>; }
