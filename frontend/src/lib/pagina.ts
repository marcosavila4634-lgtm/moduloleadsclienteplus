// Formato da página pública da loja (o servidor só guarda; quem desenha é o frontend).

export type Secao = { id: string; tipo: TipoSecao; visivel: boolean; [k: string]: any };
export type TipoSecao = "topo" | "aviso" | "beneficios" | "catalogo" | "texto_foto" | "video" | "depoimentos" | "galeria" | "perguntas" | "contato";
export type Pagina = { tema: { cor: string; cor2: string; fundo: "claro" | "creme" | "escuro"; cantos: "retos" | "arredondados" }; secoes: Secao[] };

export const NOMES_SECAO: Record<TipoSecao, string> = {
  topo: "Topo (capa)", aviso: "Faixa de aviso", beneficios: "Benefícios", catalogo: "Catálogo de produtos", texto_foto: "Texto com foto",
  video: "Vídeo", depoimentos: "Depoimentos", galeria: "Galeria de fotos", perguntas: "Perguntas frequentes", contato: "Contato e rodapé",
};

const id = () => Math.random().toString(36).slice(2, 9);

export function secaoNova(tipo: TipoSecao): Secao {
  const base = { id: id(), tipo, visivel: true };
  switch (tipo) {
    case "topo": return { ...base, titulo: "Bem-vindo à nossa loja", subtitulo: "Qualidade, preço justo e atendimento de verdade.", imagem: "", botao: "Ver produtos" };
    case "aviso": return { ...base, texto: "🚚 Frete grátis nas compras acima de R$ 199" };
    case "beneficios": return { ...base, titulo: "Por que comprar com a gente", itens: [{ icone: "🚚", titulo: "Entrega rápida", texto: "Receba em casa" }, { icone: "🔒", titulo: "Compra segura", texto: "Pague com Pix ou na entrega" }, { icone: "💬", titulo: "Atendimento no WhatsApp", texto: "Tire dúvidas na hora" }] };
    case "catalogo": return { ...base, titulo: "Nossos produtos", mostrarCategorias: true };
    case "texto_foto": return { ...base, titulo: "Nossa história", texto: "Conte aqui um pouco sobre a sua loja.", imagem: "", ladoImagem: "direita" };
    case "video": return { ...base, titulo: "Conheça", url: "" };
    case "depoimentos": return { ...base, titulo: "Quem comprou, recomenda", itens: [{ nome: "Cliente", texto: "Atendimento excelente e produto de qualidade!", nota: 5 }] };
    case "galeria": return { ...base, titulo: "Galeria", imagens: [] };
    case "perguntas": return { ...base, titulo: "Perguntas frequentes", itens: [{ pergunta: "Como funciona a entrega?", resposta: "Entregamos em toda a cidade." }] };
    case "contato": return { ...base, texto: "Fale com a gente pelo WhatsApp!", instagram: "", endereco: "", horario: "" };
  }
}

export function paginaPadrao(nome: string): Pagina {
  const p: Pagina = {
    tema: { cor: "#f47b20", cor2: "#145f6e", fundo: "creme", cantos: "arredondados" },
    secoes: [secaoNova("aviso"), secaoNova("topo"), secaoNova("beneficios"), secaoNova("catalogo"), secaoNova("depoimentos"), secaoNova("perguntas"), secaoNova("contato")],
  };
  p.secoes[1].titulo = nome;
  return p;
}

/** Link de vídeo do YouTube/Vimeo para o endereço de incorporação. */
export function videoEmbed(url: string): string | null {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}
