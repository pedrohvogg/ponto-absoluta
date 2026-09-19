import { exigirAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { obterConfig } from "@/lib/config";
import { diaBr, hojeStr } from "@/lib/datas";
import { diasCorridos, ROTULO_AUSENCIA, ROTULO_STATUS_AUSENCIA } from "@/lib/ausencia";
import FormularioAusencia from "@/components/FormularioAusencia";
import AcoesAusencia from "@/components/AcoesAusencia";

export const dynamic = "force-dynamic";

const CORES_STATUS = {
  AGENDADA: "bg-amber-100 text-amber-800",
  VALIDADA: "bg-emerald-100 text-emerald-800",
  CANCELADA: "bg-slate-200 text-slate-600",
} as const;

export default async function PaginaAusencias() {
  await exigirAdmin();
  const config = await obterConfig();
  const hoje = hojeStr(config.fusoHorario);

  const [funcionarios, ausencias] = await Promise.all([
    prisma.usuario.findMany({
      where: { papel: "FUNCIONARIO", ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, matricula: true },
    }),
    prisma.ausencia.findMany({
      orderBy: [{ status: "asc" }, { inicio: "desc" }],
      take: 200,
      include: {
        usuario: { select: { nome: true, matricula: true } },
        validadoPor: { select: { nome: true } },
      },
    }),
  ]);

  const aValidar = ausencias.filter((a) => a.status === "AGENDADA");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Férias e ausências</h1>
        <p className="text-sm text-slate-500">
          Agende o período e valide em seguida. Só depois de validado o sistema para de cobrar
          jornada nos dias — assim marcar férias e abonar horas continuam sendo dois atos separados.
        </p>
      </div>

      <FormularioAusencia funcionarios={funcionarios} hoje={hoje} />

      {aValidar.length > 0 && (
        <div className="cartao border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            {aValidar.length === 1
              ? "1 período agendado ainda não foi validado"
              : `${aValidar.length} períodos agendados ainda não foram validados`}
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Enquanto não validar, esses dias continuam entrando como falta no relatório.
          </p>
        </div>
      )}

      <div className="cartao overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-800">Períodos lançados</h2>
        </div>
        {ausencias.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            Nenhum período lançado até agora.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Funcionário</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Período</th>
                  <th className="px-4 py-2">Dias</th>
                  <th className="px-4 py-2">Situação</th>
                  <th className="px-4 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ausencias.map((a) => {
                  const emCurso = a.status === "VALIDADA" && a.inicio <= hoje && hoje <= a.fim;
                  return (
                    <tr key={a.id} className={emCurso ? "bg-emerald-50/60" : undefined}>
                      <td className="px-4 py-2">
                        <p className="font-medium text-slate-800">{a.usuario.nome}</p>
                        <p className="text-xs text-slate-500">mat. {a.usuario.matricula}</p>
                      </td>
                      <td className="px-4 py-2">{ROTULO_AUSENCIA[a.tipo]}</td>
                      <td className="px-4 py-2 tabular-nums">
                        {diaBr(a.inicio)} – {diaBr(a.fim)}
                        {emCurso && (
                          <span className="ml-2 etiqueta bg-emerald-100 text-emerald-800">
                            em curso
                          </span>
                        )}
                        {a.observacao && (
                          <p className="text-xs italic text-slate-500">{a.observacao}</p>
                        )}
                      </td>
                      <td className="px-4 py-2 tabular-nums">{diasCorridos(a.inicio, a.fim)}</td>
                      <td className="px-4 py-2">
                        <span className={`etiqueta ${CORES_STATUS[a.status]}`}>
                          {ROTULO_STATUS_AUSENCIA[a.status]}
                        </span>
                        {a.validadoPor && (
                          <p className="mt-0.5 text-xs text-slate-500">por {a.validadoPor.nome}</p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <AcoesAusencia id={a.id} status={a.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
