# Silogium

> Pense. Resolva. Submeta.

O **Silogium** é uma plataforma em construção para praticar, submeter e avaliar soluções de problemas de programação. Este primeiro protótipo oferece avaliações progressivas executadas localmente em TypeScript ou Python.

> **PROTÓTIPO DE TREINO:** as questões deste repositório são originais. Elas não foram extraídas, reproduzidas ou vazadas de processos seletivos.

## Pergunta que este protótipo responde

Este ambiente verifica se uma rotina local consegue reproduzir as partes úteis de um *Industry Coding Assessment*: uma única questão stateful, requisitos liberados em quatro níveis, compatibilidade retroativa, testes visíveis, testes ocultos simulados, pontuação de 600 pontos e limite sugerido de 90 minutos.

Há três avaliações originais e independentes:

- **Q1 — Rede de armários de encomendas:** capacidade, movimentações, agendamentos e fusão de armários.
- **Q2 — Reservas de coworking:** intervalos, rankings, fila de espera e reservas recorrentes atômicas.
- **Q3 — Fazenda de execução de jobs:** capacidade, dependências acíclicas, rankings e redistribuição atômica.

Cada questão deve ser feita separadamente em uma sessão de 90 minutos.

## Preparação inicial

```powershell
git clone https://github.com/m4rcusml/silogium.git
cd silogium
npm install
npm run open
```

As dependências npm servem apenas para executar TypeScript. Python usa somente a biblioteca padrão.

## Fluxo semelhante à avaliação

Escolha `q1`, `q2` ou `q3` e `ts` ou `py`:

```powershell
npm run assessment -- start q1 ts
npm run assessment -- status q1 ts
npm run assessment -- test q1 ts 1
npm run assessment -- test q1 ts 2
npm run assessment -- test q1 ts 3
npm run assessment -- test q1 ts 4
npm run assessment -- submit q1 ts
```

Troque `q1` por `q2` ou `q3` e `ts` por `py` quando necessário. `start` registra uma sessão local de 90 minutos; ele não encerra o editor nem apaga seu código ao final.

Arquivos para editar:

- TypeScript: `solutions/typescript/question1.ts`, `question2.ts` e `question3.ts`.
- Python: `solutions/python/question1.py`, `question2.py` e `question3.py`.

Enunciados:

- `questions/q1_parcel_network/LEVEL_1.md` até `LEVEL_4.md`.
- `questions/q2_room_reservations/LEVEL_1.md` até `LEVEL_4.md`.
- `questions/q3_build_farm/LEVEL_1.md` até `LEVEL_4.md`.

Abra apenas um nível por vez. Depois de passar os testes visíveis do nível atual, abra o próximo.

## Comandos diretos

Também é possível dispensar o controlador de sessão:

```powershell
npm run test:q1:ts -- 2
npm run grade:q1:ts
npm run test:q2:py -- 3
npm run grade:q2:py
npm run test:q3:ts -- 4
npm run grade:q3:ts
```

O último número limita os testes visíveis ao nível indicado. A submissão executa também os testes ocultos simulados e calcula até **150 pontos por nível**, totalizando **600**.

## Regras de simulação

1. Não abra `tests/*/*.hidden.*` antes de concluir a tentativa.
2. Não use IA ou soluções externas durante os 90 minutos do simulado.
3. Leia todo o nível antes de modificar o código.
4. Preserve as assinaturas públicas fornecidas.
5. Execute testes depois de cada pequena mudança.
6. Ao final, anote quais falhas foram de interpretação, sintaxe, modelagem ou caso extremo.

Os testes locais são deliberadamente transparentes e podem ser inspecionados depois da submissão para revisão. Eles não conseguem ser verdadeiramente secretos em uma máquina controlada pelo candidato.

## Solução de referência

Depois de tentar a Q1, compare sua modelagem com a implementação completa em [`reference-solutions/typescript/question1.ts`](reference-solutions/typescript/question1.ts). O avaliador nunca importa esse diretório; ele existe somente para estudo posterior.

Veja também [RECURSOS_ONLINE.md](RECURSOS_ONLINE.md) para exercícios externos selecionados.
