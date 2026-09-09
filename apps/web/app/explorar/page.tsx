import { CatalogExplorer } from "../../components/catalog-explorer";
import { getAuthoringRepository } from "@/lib/authoring";

export const metadata = { title: "Explorar questões" };

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const problems = await getAuthoringRepository().listCatalog();
  return <main className="container page"><span className="eyebrow">Catálogo</span><h1 style={{ fontSize: 46 }}>Encontre uma questão.</h1><p className="lead">Somente questões que podem ser executadas integralmente no Silogium aparecem aqui.</p><CatalogExplorer problems={problems} /></main>;
}
