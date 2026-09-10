# Preparação dos testes privados

Os seis seeds públicos continuam iguais. Seus testes versionados no Git são visíveis;
nenhum teste já publicado foi reclassificado como secreto.

Em 10/09/2026 foram adicionados nove casos novos para cada uma das três questões
clássicas, no diretório externo `../silogium-private-bundles`. Os bundles privados
e as referências das três progressivas foram preservados. O gerador usa aleatoriedade
criptográfica, oráculos independentes e grava somente arquivos ausentes (`wx`).
O código do gerador é público; as entradas concretas geradas não são.

## Verificação sem serviços externos

```powershell
npm run content:private
npm run test:private-bundles
```

Os comandos usam `SILOGIUM_PRIVATE_BUNDLES_DIR` ou, para preparação/validação local,
o diretório irmão `silogium-private-bundles`. Só executam referências confiáveis no
judge local, não código submetido por terceiros. A saída exibe contagens e vereditos,
não entradas ou respostas privadas. Não ligam a política de progresso oficial.

O preflight do seed exige caminho externo, resolve symlinks/junctions e valida todos
os pacotes antes de acessar o banco: identidade/versão, IDs únicos, estágios, modelo de
execução, referências nas duas linguagens e testes privados em cada estágio. Recusa
casos privados com a mesma entrada de um teste visível.

## Publicação posterior

`npm run db:seed` requer explicitamente `SILOGIUM_PRIVATE_BUNDLES_DIR` e credenciais
de servidor. Não roda automaticamente no build ou CI. Ele não sobrescreve bundles
ou definições divergentes de uma versão existente; mudanças exigem versionamento.

Preserve os arquivos privados e faça backup antes de carregar a versão no banco.
Não regenere arquivos perdidos para contornar erro de checksum numa versão publicada.
O seed tem verificações idempotentes, mas a carga das seis questões **não é uma única
transação**: se houver falha remota, verificar o estado parcial antes de repetir.

Fixtures privadas devem ser guardadas em armazenamento administrativo privado,
com acesso restrito e backup; `.gitignore` não substitui isso. O comando não modifica
ACLs do Windows. A execução e o isolamento reais no Modal precisam ser homologados
antes de habilitar `SILOGIUM_VERIFIED_JUDGE_POLICY`.
