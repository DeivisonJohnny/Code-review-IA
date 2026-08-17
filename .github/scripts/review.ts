import * as fs from "node:fs";
import { GoogleGenAI } from "@google/genai";

const envs = {
  gemini: process.env.GEMINI_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  prNumber: process.env.PR_NUMBER,
  repoName: process.env.REPO_NAME,
  githubUrl: "https://api.github.com",
};

const allNotEnvs = Object.values(envs).some((env) => !env);

if (allNotEnvs) {
  console.error("Some transmission was not received.");
  process.exit(1);
}

let diffContent: string;

try {
  diffContent = fs.readFileSync("diff.txt", "utf-8");
  // Questinamento:  Ee se dois processos forem executados ao mesmo tempo, ele vai sobrescrever ou renomear o arquivo do diff?
} catch (error) {
  console.error("Aconteceu algum erro ao tentar pegar o diff");
  process.exit(0);
}

if (!diffContent.trim()) {
  console.log("Não á alterações reais no código. PR de espaço vazio");
  process.exit(0);
}

const ia = new GoogleGenAI({ apiKey: envs.gemini });

const prompt = `
Você é um Engenheiro de Software Sênior revisando o seguinte git diff.

Regras:
1. Ignore formatação, estilo de código e imports não usados.
2. Foque APENAS em:
   - vulnerabilidades de segurança;
   - gargalos de performance;
   - erros de lógica graves.
3. Seja direto e explique o porquê da sua sugestão de forma curta.
4. Responda em Português do Brasil.
5. Se não houver problemas críticos, responda APENAS a palavra "LGTM" e nada mais.

Diff a ser revisado:

\`\`\`diff
${diffContent}
\`\`\`

`;

(async () => {
  try {
    const response = await ia.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
    });

    const review = response.text;

    console.log("=== AI CODE REVIEW ===");
    console.log(review);

    const isApproved = review?.trim() === "LGTM";
    const reviewEvent = isApproved ? "APPROVE" : "REQUEST_CHANGES";

    const reviewBody = isApproved
      ? "### 🤖 Revisão de Código (IA)\n\n**LGTM!** O código foi analisado e aprovado. ✅"
      : `### 🤖 Revisão de Código (IA)\n\nForam encontrados pontos de atenção que precisam ser corrigidos:\n\n${review}`;

    console.log(`Submetendo revisão oficial com status: ${reviewEvent}...`);

    const reviewUrl = `${envs.githubUrl}/repos/${envs.repoName}/pulls/${envs.prNumber}/reviews`;

    const responseReview = await fetch(reviewUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${envs.githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: reviewBody,
        event: reviewEvent,
      }),
    });

    const responseData = await responseReview.json();

    if (responseReview.ok) {
      console.log(`🚀 Revisão (${reviewEvent}) submetida com sucesso!`);
      console.log("Retorno do github =>>> ", responseData);
    } else {
      console.error("Falha ao submeter a revisão no GitHub:", responseData);
    }
  } catch (error) {
    console.error("Erro ao executar revisão com Gemini:", error);
    process.exit(1);
  }
})();
