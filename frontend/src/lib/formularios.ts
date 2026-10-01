// Formato dos formulários (anamnese, contrato, termo) usados na agenda e no prontuário.

export type Pergunta = { id: string; rotulo: string; tipo: "texto" | "longo" | "sim_nao" | "opcoes" | "data"; opcoes?: string[]; obrigatoria?: boolean };
export type ConteudoFormulario = { texto?: string; perguntas: Pergunta[] };

export const TIPOS_PERGUNTA: { valor: Pergunta["tipo"]; rotulo: string }[] = [
  { valor: "texto", rotulo: "Resposta curta" }, { valor: "longo", rotulo: "Resposta longa" }, { valor: "sim_nao", rotulo: "Sim ou não" },
  { valor: "opcoes", rotulo: "Escolha uma opção" }, { valor: "data", rotulo: "Data" },
];

export const TIPOS_FORMULARIO: Record<string, string> = { anamnese: "Anamnese / ficha", consentimento: "Termo de consentimento", nota: "Modelo de nota do atendimento" };

export const perguntaNova = (): Pergunta => ({ id: Math.random().toString(36).slice(2, 9), rotulo: "", tipo: "texto", obrigatoria: false });
