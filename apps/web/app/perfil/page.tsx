import { TokenManager } from "@/components/token-manager";

export const metadata = { title: "Perfil" };

export default function ProfilePage() {
  return <main className="container page"><span className="eyebrow">Conta</span><h1 style={{ fontSize: 46 }}>Perfil e terminal</h1><p className="lead">Gerencie o acesso da CLI sem compartilhar sua sessão do navegador.</p><TokenManager /></main>;
}
