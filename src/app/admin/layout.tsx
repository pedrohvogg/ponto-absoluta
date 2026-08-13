import { exigirAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { obterConfig } from "@/lib/config";
import Cabecalho from "@/components/Cabecalho";

export const dynamic = "force-dynamic";

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const sessao = await exigirAdmin();
  const [config, pendentes] = await Promise.all([
    obterConfig(),
    prisma.solicitacao.count({ where: { status: "PENDENTE" } }),
  ]);

  return (
    <>
      <Cabecalho sessao={sessao} nomeEmpresa={config.nomeEmpresa} pendentes={pendentes} />
      <main className="mx-auto max-w-7xl p-4">{children}</main>
    </>
  );
}
