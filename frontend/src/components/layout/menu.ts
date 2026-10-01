import {
  BarChart3,
  Bot,
  Briefcase,
  CalendarDays,
  Cable,
  ContactRound,
  FileSignature,
  Globe,
  KanbanSquare,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type ItemMenu = {
  rotulo: string;
  para?: string;
  icone: LucideIcon;
  tour?: string;
  minimo?: "atendente" | "supervisor" | "admin" | "dono";
  filhos?: { rotulo: string; para: string }[];
};

export const MENU: ItemMenu[] = [
  { rotulo: "Painel", para: "/painel", icone: LayoutDashboard, tour: "menu-painel" },
  { rotulo: "Conversas", para: "/conversas", icone: MessagesSquare, tour: "menu-conversas" },
  { rotulo: "Funil de vendas", para: "/crm", icone: KanbanSquare, tour: "menu-crm" },
  { rotulo: "Contatos", para: "/contatos", icone: ContactRound, tour: "menu-contatos" },
  { rotulo: "Agenda", para: "/agenda", icone: CalendarDays },
  { rotulo: "Robôs de IA", para: "/agentes", icone: Bot, tour: "menu-agentes", minimo: "supervisor" },
  { rotulo: "Automações", para: "/automacoes", icone: Workflow, tour: "menu-automacoes", minimo: "supervisor" },
  {
    rotulo: "Loja",
    icone: ShoppingBag,
    tour: "menu-catalogo",
    filhos: [
      { rotulo: "Catálogo", para: "/catalogo" },
      { rotulo: "Pedidos", para: "/pedidos" },
      { rotulo: "Cupons", para: "/cupons" },
      { rotulo: "Página da loja", para: "/pagina" },
    ],
  },
  {
    rotulo: "Marketing",
    icone: Megaphone,
    minimo: "supervisor",
    filhos: [
      { rotulo: "Disparos", para: "/disparos" },
      { rotulo: "Templates da Meta", para: "/templates" },
      { rotulo: "Captação (Insta e anúncios)", para: "/captacao" },
      { rotulo: "Links e origem", para: "/tracking" },
    ],
  },
  {
    rotulo: "Vendas",
    icone: TrendingUp,
    filhos: [
      { rotulo: "Central de vendas", para: "/vendas" },
      { rotulo: "Propostas", para: "/propostas" },
      { rotulo: "Previsão e inteligência", para: "/inteligencia" },
    ],
  },
  { rotulo: "Relatórios", para: "/relatorios", icone: BarChart3, minimo: "supervisor" },
  { rotulo: "Equipe", para: "/equipe", icone: Users },
  { rotulo: "Conexões", para: "/conexoes", icone: Cable, tour: "menu-conexoes", minimo: "admin" },
  { rotulo: "Configurações", para: "/configuracoes", icone: Settings, minimo: "admin" },
];

export const MENU_ADMIN: ItemMenu = { rotulo: "Admin da plataforma", para: "/admin", icone: ShieldCheck };

// usados em telas (atalhos)
export const ICONES = { Package, FileSignature, Globe, Briefcase };
