import Link from "next/link";
import type { Sessao } from "@/lib/sessao";
import BotaoSair from "./BotaoSair";

type ItemMenu = { href: string; rotulo: string };

const MENU_ADMIN: ItemMenu[] = [
  { href: "/admin", rotulo: "Painel" },
  { href: "/admin/funcionarios", rotulo: "Funcionários" },
  { href: "/admin/registros", rotulo: "Registros" },
  { href: "/admin/ajustes", rotulo: "Ajustes" },
  { href: "/admin/relatorios", rotulo: "Relatórios" },
  { href: "/admin/configuracoes", rotulo: "Configurações" },
];

const MENU_FUNCIONARIO: ItemMenu[] = [
  { href: "/ponto", rotulo: "Bater ponto" },
  { href: "/meus-registros", rotulo: "Meus registros" },
  { href: "/minha-biometria", rotulo: "Meu rosto" },
];

export default function Cabecalho({
  sessao,
  nomeEmpresa,
  pendentes = 0,
}: {
  sessao: Sessao;
  nomeEmpresa: string;
  pendentes?: number;
}) {
  const admin = sessao.papel === "ADMIN";
  const menu = admin ? MENU_ADMIN : MENU_FUNCIONARIO;

  return (
    <header className="nao-imprimir sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href={admin ? "/admin" : "/ponto"} className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-marca-600 text-white">
            ⏱
          </span>
          <span className="text-sm font-bold text-slate-900">{nomeEmpresa}</span>
        </Link>

        <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:mx-0 md:w-auto">
          {menu.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              {item.rotulo}
              {item.href === "/admin/ajustes" && pendentes > 0 && (
                <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {pendentes}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium leading-tight text-slate-800">{sessao.nome}</p>
            <p className="text-xs leading-tight text-slate-500">
              {admin ? "Administrador" : "Funcionário"}
            </p>
          </div>
          <BotaoSair />
        </div>
      </div>
    </header>
  );
}
