import { prisma } from "@/lib/prisma";
import { diaBr } from "@/lib/datas";
import { ROTULO_TIPO } from "@/lib/jornada";
import { EtiquetaStatus } from "@/components/Etiquetas";
import DecidirAjuste from "@/components/DecidirAjuste";

export const dynamic = "force-dynamic";

const ROTULO_ACAO = {
  INCLUIR: "Incluir batida",
  ALTERAR: "Corrigir horário",
  EXCLUIR: "Excluir batida",
} as const;

export default async function PaginaAjustes({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = "PENDENTE" } = await searchParams;

  const solicitacoes = await prisma.solicitacao.findMany({
    where: status === "TODAS" ? {} : { status: status as "PENDENTE" | "APROVADA" | "REJEITADA" },
    orderBy: [{ status: "asc" }, { criadoEm: "desc" }],
    take: 200,
    include: {
      usuario: { select: { nome: true, matricula: true } },
      revisadoPor: { select: { nome: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Solicitações de ajuste</h1>
        <p className="text-sm text-slate-500">
          Pedidos de inclusão, correção ou exclusão de batidas feitos pelos funcionários.
        </p>
      </div>

      <div className="flex gap-2">
        {["PENDENTE", "APROVADA", "REJEITADA", "TODAS"].map((s) => (
          <a
            key={s}
            href={`/admin/ajustes?status=${s}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              status === s ? "bg-marca-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "TODAS" ? "Todas" : s.charAt(0) + s.slice(1).toLowerCase() + "s"}
          </a>
        ))}
      </div>

      {solicitacoes.length === 0 ? (
        <div className="cartao p-8 text-center text-slate-500">
          Nenhuma solicitação {status === "TODAS" ? "" : status.toLowerCase()}.
        </div>
      ) : (
        <ul className="space-y-3">
          {solicitacoes.map((s) => (
            <li key={s.id} className="cartao p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[240px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800">{s.usuario.nome}</span>
                    <span className="text-xs text-slate-500">mat. {s.usuario.matricula}</span>
                    <EtiquetaStatus status={s.status} />
                  </div>

                  <p className="mt-2 text-sm text-slate-700">
                    <strong>{ROTULO_ACAO[s.acao]}</strong> · {diaBr(s.dia)} ·{" "}
                    {ROTULO_TIPO[s.tipo]}
                    {s.horario && (
                      <>
                        {" "}
                        às <span className="font-mono">{s.horario}</span>
                      </>
                    )}
                  </p>

                  <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-600">
                    “{s.motivo}”
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    Solicitado em{" "}
                    {s.criadoEm.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    {s.revisadoEm && s.revisadoPor && (
                      <>
                        {" "}
                        · analisado por {s.revisadoPor.nome} em{" "}
                        {s.revisadoEm.toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </>
                    )}
                  </p>

                  {s.respostaAdmin && (
                    <p className="mt-1 text-sm text-slate-600">
                      <strong>Resposta:</strong> {s.respostaAdmin}
                    </p>
                  )}
                </div>

                {s.status === "PENDENTE" && <DecidirAjuste id={s.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
