# Judge remoto: modelo de confiança v2

## O problema corrigido

O runner anterior gravava `/work/payload.json` com o bundle completo e comparava retornos dentro do mesmo ambiente que o candidato controlava. A solução podia ler respostas, alterar funções do harness ou escrever JSON de aprovação. Remover somente `referenceSolutions` não protegia testes ocultos nem vereditos.

Agora a interface interna é `CaseExecutor.run(CandidateCase) -> ProcessOutput`. O controlador conhece os casos e compara valores; o adapter não recebe fixtures completas. Os wrappers dentro da sandbox são considerados tão não confiáveis quanto a solução. Não há assinatura, segredo ou decisão de aprovação dentro deles.

| Informação | Controlador | Sandbox candidata |
| --- | --- | --- |
| Fonte submetida | Sim | Sim |
| Entrada do caso atual e entrypoint | Sim | Sim |
| Respostas esperadas | Sim | Nunca |
| Outros casos, IDs, títulos e estágios | Sim | Nunca |
| Referências | Nem sequer são enviadas pelo adapter HTTP | Nunca |
| Token do endpoint / credenciais Modal | Somente ambiente do controlador | Não configurados |
| Veredito, pontuação, sanitização | Calculados aqui | Nenhuma autoridade |

`stdio` devolve bytes que o controlador compara após normalizar CRLF e espaços finais. `call-sequence` devolve somente uma lista JSON de `{value}` por chamada. Cada retorno é copiado imediatamente, antes de a próxima chamada poder mutá-lo. Objetos JSON são comparados por conteúdo (ordem de chaves irrelevante); arrays mantêm ordem; booleanos não equivalem a números. NaN/Infinity, valores indefinidos, chaves duplicadas e JSON inválido são rejeitados. A implementação local antiga ainda usa sua comparação própria; ela **não é um sandbox seguro** e não deve avaliar código de terceiros em produção.

A entrada `stdio` do caso atual fica em `/work/stdin.txt` e é aberta por redirecionamento antes de iniciar o candidato. Compilação e `call-sequence` usam `/dev/null`. O comando shell contém somente texto fixo e argumentos de execução fixos; não interpola fonte, entrada, métodos ou nomes fornecidos pelo candidato. Isso elimina a corrida observada no primeiro smoke remoto: programas curtos como `print(0)` podiam terminar antes do RPC de envio de stdin/EOF e virar `system_error`. A leitura posterior de stdout/stderr continua limitada; não se ignora uma falha de transporte para fabricar um veredito.

Toda a sequência de chamadas de um caso pertence à mesma instância e pode ser observada pela solução; essa é a unidade de isolamento. Outro caso nunca é colocado nessa sandbox. Não é possível nem necessário provar que a solução usou a classe/wrapper original: produzir valores corretos pelas próprias rotinas equivale funcionalmente a resolvê-lo. Imprimir `passed: true`, IDs ou `score` não tem autoridade e é rejeitado pelo protocolo de valores.

## Recursos e falhas

- Imagem limpa por caso, sem volumes, snapshots de candidatos, árvores do projeto, secrets, OIDC ou portas publicadas; `block_network=True`.
- Memória hard limit `min(limite da questão, 256)` MiB; CPU request 0,25 e hard limit 1.
- `Sandbox.exec` limita o processo e o controlador mede o prazo de cada candidato após preparação/compilação. O limite individual é no máximo 2 s. Compilação tem prazo de infraestrutura separado, até 10 s.
- Até quatro casos em paralelo; prazo global de processamento 30 s, seguido de cleanup limitado a 3 s. Cold start/preparação excessivos são `system_error`; o caminho existente da aplicação reembolsa falhas de infraestrutura.
- Leitura binária concorrente de stdout/stderr limita o que o controlador retém a 64 KiB combinados (ou limite menor). Ao exceder, interrompe leitura e termina a sandbox. O transporte/SDK pode ter bytes em trânsito; o comportamento sob flood deve ser medido no Modal real. Não se usa leitura integral, última linha como veredito, nem arquivo de resultado candidato.
- Ao sair por sucesso, falha ou cancelamento, o adapter solicita `terminate` e `detach`; o lifetime da sandbox de 30 s é a proteção adicional se o controlador/RPC falhar. Nunca reutilizar uma sandbox terminada parcialmente.
- Código de saída 137/-9 é classificado como `memory_limit` por compatibilidade, mas **SIGKILL não comprova OOM**: o programa pode encerrar a si próprio. A política impede aprovação indevida; diagnóstico exato exige evidência de infraestrutura.
- Resultados HTTP têm tamanho limitado, versão de protocolo e correlação por requestId. O adapter revalida inventário integral, IDs únicos, estágios, veredito e score calculado; v1 falha fechado como `system_error`.
- Falhas de submissão nunca incluem stderr candidato; diferenças de casos ocultos nunca saem do controlador. Diferenças visíveis são opcionais e limitadas; a comparação sempre usa valores completos, nunca truncados.

## O que os testes realmente provam

Os testes Python usam adapter falso e as definições reais do adapter Modal com SDK simulado, sem instalar ou acessar Modal. Cobrem projeção sem respostas/referências/futuros casos, independência de instâncias, opções de recursos/rede/secrets, streaming limitado, cleanup, prazo total, cancelamento, JSON adversarial e pontuação. Os testes Vitest executam wrappers benignos localmente para duas linguagens, incluindo a tentativa de ler o antigo payload, estado compartilhado, snapshots de retorno e stdout forjado; testam também protocolo HTTP v2/inventário adulterado com fetch falso.

Isso **não prova** isolamento de kernel, bloqueio efetivo de rede, OOM real, latência de cold start, custo, limites internos do SDK ou funcionamento de um deploy. Esses testes offline não fazem chamadas ao Modal nem inspecionam secrets reais.

Atualização do smoke autorizado em 10/09/2026: o endpoint foi publicado e houve execução sintética limitada, ainda sem homologação de segurança. TypeScript/stdio correto, Python/call-sequence correto e TypeScript/call-sequence incorreto deram os vereditos esperados. Python `print(0)` reproduziu `system_error`; ler stdin antes de imprimir a mesma resposta mudou o resultado para `wrong_answer`, isolando a corrida acima. A correção foi testada offline e precisa de novo deploy/repetição do smoke original. Rede/OOM/flood, cleanup real, custo e bundles completos continuam não homologados; não habilitar a política oficial apenas com essa evidência.

Além desses testes, o smoke `python -m infra.modal.check_sdk` passou com Modal 1.5.5 e FastAPI 0.139.2 instalados em venv local isolado. As definições e assinaturas carregaram com conexões de rede bloqueadas; nenhuma imagem foi construída, recurso provisionado ou conta acessada.

Antes de liberar produção, num ambiente separado autorizado:

1. Fixar a versão do SDK e construir imagens; publicar v2 e conferir autenticação sem logar corpos/tokens.
2. Executar todos os bundles, inclusive ~30 casos, e medir latência/cold start/concurrency sem reduzir isolamento.
3. Usar probes controlados de filesystem/env que procurem apenas marcadores sintéticos, sem imprimir credenciais; verificar ausência do controller, respostas, próximas entradas e identidade OIDC.
4. Exercitar timeout, descendentes de processo, flood em stdout e stderr sem newline, alocação acima do limite e conexões de rede bloqueadas. Conferir término das sandboxes e classificação de falha.
5. Comparar soluções de referência nas duas linguagens e testar tentativa de alterar o wrapper/imprimir veredito. Referências servem como fonte submetida nesse ensaio, nunca como arquivo adicional.
6. Só depois habilitar a política de judge confiável da aplicação. A existência do protocolo v2, sozinha, não certifica infraestrutura nem durabilidade de progresso.

## Fontes oficiais consultadas

Configuração de sandboxes, limites hard de memória, timeout, secrets e OIDC: [referência Sandbox](https://modal.com/docs/sdk/py/latest/Sandbox). Bloqueio de saída e isolamento padrão de recursos Modal: [Networking and security](https://modal.com/docs/guide/sandbox-networking). Leitura incremental e APIs assíncronas: [Running commands](https://modal.com/docs/guide/sandbox-spawn) e [io_streams](https://modal.com/docs/sdk/py/latest/io_streams). Consulta em 10/09/2026; nenhuma garantia de execução real foi inferida dessas páginas.
