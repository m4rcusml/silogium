import { z } from "zod";

// Shared output contract for both discovery providers. Licensing is deliberately absent.
export const WebSearchResultSchema = z.object({
  candidates: z.array(z.object({
    title: z.string().min(1).max(180),
    summary: z.string().min(1).max(600),
    url: z.string().max(2048),
    sourceName: z.string().min(1).max(100)
  })).max(3)
});

export const webSearchJsonSchema = {
  type: "object", additionalProperties: false, required: ["candidates"],
  properties: {
    candidates: {
      type: "array", maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "summary", "url", "sourceName"],
        properties: {
          title: { type: "string" }, summary: { type: "string" },
          url: { type: "string" }, sourceName: { type: "string" }
        }
      }
    }
  }
} as const;

export const webSearchInstructions = "Pesquise exercícios nas páginas originais. Produza até 3 resultados e um resumo original de até 600 caracteres por resultado, identificando conceitos, habilidades e tema quando a fonte os sustentar. Não copie enunciados. Não invente dificuldade, formato ou licença. Use somente URLs encontradas nas fontes consultadas. Os resultados conhecidos servem para encontrar outras questões relevantes; não os apresente como descobertas novas. Devolva o JSON solicitado, com título de até 180 caracteres e nome da fonte de até 100 caracteres.";
