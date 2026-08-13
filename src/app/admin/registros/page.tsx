import { prisma } from "@/lib/prisma";
import { obterConfig } from "@/lib/config";
import { diaBr, hojeStr, horaDe, limitesDoDia, somaDias } from "@/lib/datas";
import { formatarDistancia } from "@/lib/geo";
import { confiancaPercentual } from "@/lib/face";
import { EtiquetaOrigem, EtiquetaTipo } from "@/components/Etiquetas";
import LancamentoManual from "@/components/LancamentoManual";
import AcoesRegistro from "@/components/AcoesRegistro";

export const dynamic = "force-dynamic";

export default async function PaginaRegistros({
  searchParams,
}: {
  searchParams: Promise<{ funcionarioId?: string; de?: string; ate?: string; origem?: string }>;
}) {
  const config = await obterConfig();
  const hoje = hojeStr(config.fusoHorario);
  const filtros = await searchParams;
  const de = filtros.de ?? somaDias(hoje, -6);
  const ate = filtros.ate ?? hoje;

  const [funcionarios, registros] = await Promise.all([
    prisma.usuario.findMany({
      where: { papel: "FUNCIONARIO" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, matricula: true, ativo: true },
    }),
    prisma.registro.findMany({
      where: {
        ...(filtros.funcionarioId ? { usuarioId: filtros.funcionarioId } : {}),
        ...(filtros.origem
          ? { origem: filtros.origem as "FACIAL" | "MANUAL" | "AJUSTE" }
          : {}),
        momento: {
          gte: limitesDoDia(de, config.fusoHorario).inicio,
          lt: limitesDoDia(ate, config.fusoHorario).fim,
        },
      },
      orderBy: { momento: "desc" },
      take: 300,
      include: {
        usuario: { select: { nome: true, matricula: true } },
        lancadoPor: { select: { nome: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Registros de ponto</h1>
        <p className="text-sm text-slate-500">
          Todas as batidas, com origem, foto de comprovação e localização.
        </p>
      </div>

      <form className="cartao flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="funcionarioId" className="rotulo text-xs">
            Funcionário
          </label>
          <select
            id="funcionarioId"
            name="funcionarioId"
            defaultValue={filtros.funcionarioId ?? ""}
            className="campo py-1.5"
          >
            <option value="">Todos</option>
            {funcionarios.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome} {f.ativo ? "" : "(inativo)"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="de" className="rotulo text-xs">
            De
          </label>
          <input id="de" type="date" name="de" defaultValue={de} className="campo py-1.5" />
        </div>
        <div>
          <label htmlFor="ate" className="rotulo text-xs">
            Até
          </label>
          <input id="ate" type="date" name="ate" defaultValue={ate} className="campo py-1.5" />
        </div>
        <div>
          <label htmlFor="origem" className="rotulo text-xs">
            Origem
          </label>
          <select id="origem" name="origem" defaultValue={filtros.origem ?? ""} className="campo py-1.5">
            <option value="">Todas</option>
            <option value="FACIAL">Facial</option>
            <option value="MANUAL">Manual</option>
            <option value="AJUSTE">Ajuste</option>
          </select>
        </div>
        <button className="botao-secundario py-2">Filtrar</button>
      </form>

      <LancamentoManual
        funcionarios={funcionarios.filter((f) => f.ativo).map((f) => ({ id: f.id, nome: f.nome }))}
      />

      <div className="cartao overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
          {registros.length} registro(s) — {diaBr(de)} a {diaBr(ate)}
          {registros.length === 300 && " (mostrando os 300 mais recentes)"}
        </div>

        {registros.length === 0 ? (
          <p className="p-8 text-center text-slate-500">Nenhum registro no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Foto</th>
                  <th className="px-3 py-2">Funcionário</th>
                  <th className="px-3 py-2">Data / hora</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Origem</th>
                  <th className="px-3 py-2">Confiança</th>
                  <th className="px-3 py-2">Local</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registros.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      {r.fotoBase64 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.fotoBase64}
                          alt=""
                          className="h-10 w-10 scale-x-[-1] rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
                          —
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-800">{r.usuario.nome}</p>
                      <p className="text-xs text-slate-500">mat. {r.usuario.matricula}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums">
                      {diaBr(r.dia)}
                      <br />
                      <span className="text-sm">{horaDe(r.momento, config.fusoHorario)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <EtiquetaTipo tipo={r.tipo} />
                    </td>
                    <td className="px-3 py-2">
                      <EtiquetaOrigem origem={r.origem} />
                      {r.lancadoPor && (
                        <p className="mt-0.5 text-[11px] text-slate-500">por {r.lancadoPor.nome}</p>
                      )}
                      {r.observacao && (
                        <p className="mt-0.5 max-w-[200px] text-[11px] italic text-slate-500">
                          {r.observacao}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.faceDistancia != null ? (
                        <span
                          className={
                            confiancaPercentual(r.faceDistancia) >= 50
                              ? "text-emerald-700"
                              : "text-amber-700"
                          }
                        >
                          {confiancaPercentual(r.faceDistancia)}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.latitude == null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=17/${r.latitude}/${r.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className={
                            r.dentroDaCerca === false
                              ? "font-medium text-amber-700 hover:underline"
                              : "text-slate-600 hover:underline"
                          }
                        >
                          {r.dentroDaCerca === false ? "fora · " : ""}
                          {formatarDistancia(r.distanciaMetros)}
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <AcoesRegistro
                        id={r.id}
                        hora={horaDe(r.momento, config.fusoHorario)}
                        tipo={r.tipo}
                      />
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
