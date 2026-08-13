import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ListaFuncionarios({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; inativos?: string }>;
}) {
  const { busca = "", inativos } = await searchParams;
  const mostrarInativos = inativos === "1";

  const funcionarios = await prisma.usuario.findMany({
    where: {
      ...(mostrarInativos ? {} : { ativo: true }),
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: "insensitive" as const } },
              { email: { contains: busca, mode: "insensitive" as const } },
              { matricula: { contains: busca, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      email: true,
      matricula: true,
      cargo: true,
      departamento: true,
      papel: true,
      ativo: true,
      ultimoLogin: true,
      _count: { select: { biometrias: true, registros: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Funcionários</h1>
          <p className="text-sm text-slate-500">
            Crie acessos, defina jornadas e acompanhe o cadastro facial.
          </p>
        </div>
        <Link href="/admin/funcionarios/novo" className="botao-primario">
          + Novo funcionário
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="busca" className="rotulo text-xs">
            Buscar
          </label>
          <input
            id="busca"
            name="busca"
            defaultValue={busca}
            placeholder="nome, e-mail ou matrícula"
            className="campo py-1.5"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" name="inativos" value="1" defaultChecked={mostrarInativos} />
          incluir inativos
        </label>
        <button className="botao-secundario py-2">Filtrar</button>
      </form>

      <div className="cartao overflow-hidden">
        {funcionarios.length === 0 ? (
          <p className="p-8 text-center text-slate-500">Nenhum funcionário encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Nome</th>
                  <th className="px-4 py-2">Matrícula</th>
                  <th className="px-4 py-2">Cargo / setor</th>
                  <th className="px-4 py-2">Rosto</th>
                  <th className="px-4 py-2">Último acesso</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {funcionarios.map((f) => (
                  <tr key={f.id} className={f.ativo ? "hover:bg-slate-50" : "bg-slate-50/60 text-slate-400"}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{f.nome}</span>
                        {f.papel === "ADMIN" && (
                          <span className="etiqueta bg-purple-100 text-purple-800">admin</span>
                        )}
                        {!f.ativo && (
                          <span className="etiqueta bg-slate-200 text-slate-600">inativo</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{f.email}</p>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{f.matricula}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {f.cargo ?? "—"}
                      {f.departamento ? ` · ${f.departamento}` : ""}
                    </td>
                    <td className="px-4 py-2">
                      {f.papel === "ADMIN" ? (
                        <span className="text-xs text-slate-400">não se aplica</span>
                      ) : f._count.biometrias > 0 ? (
                        <span className="etiqueta bg-emerald-100 text-emerald-800">
                          {f._count.biometrias} captura(s)
                        </span>
                      ) : (
                        <span className="etiqueta bg-amber-100 text-amber-800">pendente</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {f.ultimoLogin
                        ? f.ultimoLogin.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                        : "nunca acessou"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/admin/funcionarios/${f.id}`}
                        className="text-sm font-medium text-marca-700 hover:underline"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
