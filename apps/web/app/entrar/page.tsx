import { Github, ShieldCheck, TerminalSquare } from "lucide-react";
import { GitHubLogin } from "../../components/github-login";

export const metadata = { title: "Entrar" };
export default function LoginPage() {
  return <main className="container page" style={{ maxWidth: 640 }}><div className="card" style={{ padding: 32 }}><span className="eyebrow">Sua conta</span><h1 style={{ fontSize: 42 }}>Entre no Silogium.</h1><p className="lead" style={{ fontSize: 16 }}>Use sua conta GitHub para sincronizar questões, submissões e acesso da CLI.</p><GitHubLogin /><div className="result-list"><p className="muted"><ShieldCheck size={15} /> Rascunhos privados são protegidos por políticas no banco.</p><p className="muted"><TerminalSquare size={15} /> Tokens da CLI são revogáveis e exibidos uma única vez.</p><p className="muted"><Github size={15} /> O Silogium solicita somente os dados básicos do seu perfil.</p></div></div></main>;
}
