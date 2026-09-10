import Link from "next/link";
import { FilePenLine, Search } from "lucide-react";

type StudioMode = "search" | "create" | "refine";

export function StudioGuide() {
  return <details className="studio-guide">
    <summary>Como funciona o Studio?</summary>
    <div className="studio-guide-content">
      <p>O Studio ajuda você a encontrar ou preparar uma questão. Para escrever sua solução e testar o código, abra a questão em <strong>Resolver</strong>.</p>
      <dl>
        <div><dt>Pesquisar</dt><dd>Encontre questões do Silogium e de outras fontes. Links externos são resolvidos no site original; questões licenciadas podem ser importadas quando essa opção estiver disponível.</dd></div>
        <div><dt>Criar</dt><dd>Descreva o que quer praticar. Se já houver questões parecidas, você escolhe entre aproveitá-las e criar uma nova com IA, sem pesquisa na web.</dd></div>
        <div><dt>Minhas questões</dt><dd>Retome questões criadas ou importadas, ajuste o enunciado e acompanhe a validação. Publicar no catálogo é opcional e depende de revisão.</dd></div>
      </dl>
      <p>Quer apenas começar a resolver? <Link href="/explorar">Abra o catálogo de questões.</Link></p>
    </div>
  </details>;
}

export function StudioModePicker({ mode, canRefine, disabled, onChange }: { mode: StudioMode; canRefine: boolean; disabled: boolean; onChange(mode: StudioMode): void }) {
  return <div className="studio-intent">
    <h2>O que você quer fazer?</h2>
    <div className="studio-mode-options" role="group" aria-label="Modo do assistente">
      <button type="button" aria-label="Pesquisar" aria-describedby="studio-search-description" aria-pressed={mode === "search"} disabled={disabled} onClick={() => onChange("search")}><Search size={19} aria-hidden="true" /><span><strong>Pesquisar</strong><span id="studio-search-description">Encontre questões por assunto ou habilidade.</span></span></button>
      <button type="button" aria-label="Criar" aria-describedby="studio-create-description" aria-pressed={mode === "create"} disabled={disabled} onClick={() => onChange("create")}><FilePenLine size={19} aria-hidden="true" /><span><strong>Criar</strong><span id="studio-create-description">Peça uma nova questão para praticar.</span></span></button>
      {canRefine && <button type="button" aria-label="Refinar" aria-describedby="studio-refine-description" aria-pressed={mode === "refine"} disabled={disabled} onClick={() => onChange("refine")}><FilePenLine size={19} aria-hidden="true" /><span><strong>Refinar</strong><span id="studio-refine-description">Peça alterações nesta questão.</span></span></button>}
    </div>
  </div>;
}

const examples = {
  search: [
    ["Arrays e mapas", "Quero praticar arrays e mapas em uma questão fácil, com contagem de frequências."],
    ["Intervalos", "Procure questões médias sobre ordenação e união de intervalos."],
    ["Sistemas em etapas", "Quero uma questão progressiva para praticar estado, filas e regras de negócio."]
  ],
  create: [
    ["Contagem de eventos", "Crie uma questão sobre contar eventos e ordenar os resultados, com regras claras de desempate."],
    ["Agenda de reuniões", "Crie uma questão sobre conflitos em uma agenda de reuniões, com intervalos e casos de borda."]
  ],
  refine: [["Esclarecer as regras", "Esclareça as regras de desempate e acrescente exemplos com entradas repetidas, sem mudar o objetivo da questão."]]
} satisfies Record<StudioMode, string[][]>;

export function StudioExamples({ mode, onChoose }: { mode: StudioMode; onChoose(value: string): void }) {
  return <div className="studio-examples" aria-label="Exemplos de pedido">
    <span>Sem ideia? Use um exemplo:</span>
    <div>{examples[mode].map(([label, value]) => <button className="button" type="button" key={label} onClick={() => onChoose(value!)}>{label}</button>)}</div>
  </div>;
}
