import { Github, ShieldCheck, TerminalSquare } from "lucide-react";
import { GitHubLogin } from "../../components/github-login";

export const metadata = { title: "Entrar" };
export default function LoginPage() {
  return <main className="container page" style={{ maxWidth: 640 }}><div className="card" style={{ padding: 32 }}><span className="eyebrow">Sua conta · Beta fechado</span><h1 style={{ fontSize: 42 }}>Entre no Silogium.</h1><p className="lead" style={{ fontSize: 16 }}>Use sua conta GitHub para entrar na lista de espera. A administração libera o acesso à IA e às execuções remotas; enquanto isso, o catálogo fica aberto para explorar.</p><GitHubLogin /><div className="result-list"><p className="muted"><ShieldCheck size={15} /> Rascunhos privados são protegidos por políticas no banco.</p><p className="muted"><TerminalSquare size={15} /> A aprovação também vale para a CLI. Tokens são revogáveis e exibidos uma única vez.</p><p className="muted"><Github size={15} /> O Silogium solicita somente os dados básicos do seu perfil. Uma conta pré-aprovada recebe acesso no primeiro login.</p></div></div></main>;
}
