import { exigirFuncionario } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { obterConfig } from "@/lib/config";
import { espelhoDePonto } from "@/lib/consultas";
import { totalizar } from "@/lib/jornada";
import { diaBr, diaSemanaCurto, hojeStr, horaDe, limitesDoMes, minutosParaHoras } from "@/lib/datas";
import Cabecalho from "@/components/Cabecalho";
import SolicitarAjuste from "@/components/SolicitarAjuste";
import { EtiquetaStatus } from "@/components/Etiquetas";

export const dynamic = "force-dynamic";

export default async function MeusRegistros({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const sessao = await exigirFuncionario();
  const config = await obterConfig();
  const hoje = hojeStr(config.fusoHorario);
  const mes = limitesDoMes(hoje);
  const { de = mes.de, ate = mes.ate } = await searchParams;

  const [espelho, solicitacoes] = await Promise.all([
    espelhoDePonto(sessao.id, de, ate),
    prisma.solicitacao.findMany({
      where: { usuarioId: sessao.id },
      orderBy: { criadoEm: "desc" },
      take: 20,
      select: {
        id: true,
        dia: true,
        tipo: true,
        horario: true,
        acao: true,
        status: true,
        motivo: true,
        respostaAdmin: true,
      },
    }),
  ]);

  if (!espelho) return null;
  const totais = totalizar(espelho.jornadas);
  const comMovimento = espelho.jornadas.filter((j) => j.registros.length > 0 || j.diaUtil);

  return (
    <>
      <Cabecalho sessao={sessao} nomeEmpresa={config.nomeEmpresa} />
      <main className="mx-auto max-w-5xl space-y-5 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Meus registros</h1>
            <p className="text-sm text-slate-500">
              {diaBr(espelho.de)} a {diaBr(espelho.ate)}
            </p>
          </div>
          <form className="flex items-end gap-2">
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
            <button className="botao-secundario py-2">Ver</button>
          </form>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador titulo="Trabalhado" valor={minutosParaHoras(totais.trabalhado)} />
          <Indicador titulo="Previsto" valor={minutosParaHoras(totais.previsto)} />
          <Indicador
            titulo="Saldo"
            valor={minutosParaHoras(totais.saldo)}
            cor={totais.saldo >= 0 ? "text-emerald-600" : "text-red-600"}
          />
          <Indicador titulo="Dias trabalhados" valor={String(totais.diasTrabalhados)} />
        </div>

        <div className="cartao overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dia</th>
                  <th className="px-3 py-2">Batidas</th>
                  <th className="px-3 py-2 text-right">Trabalhado</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comMovimento.map((j) => (
                  <tr key={j.dia} className={j.diaUtil ? "" : "bg-slate-50/60"}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-mono text-xs">{diaBr(j.dia)}</span>{" "}
                      <span className="text-xs text-slate-400">{diaSemanaCurto(j.dia)}</span>
                      {j.atrasoMinutos > 0 && (
                        <span className="ml-1 etiqueta bg-amber-100 text-amber-800">atraso</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-slate-600">
                      {j.detalhes.length === 0
                        ? "—"
                        : j.detalhes
                            .map((r) => horaDe(r.momento, config.fusoHorario))
                            .join(" · ")}
                      {j.inconsistente && (
                        <span className="ml-2 etiqueta bg-red-100 text-red-700">
                          sequência incompleta
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {minutosParaHoras(j.trabalhado)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono tabular-nums ${
                        j.saldo < 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {minutosParaHoras(j.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <SolicitarAjuste
          registros={espelho.jornadas.flatMap((j) =>
            j.detalhes.map((r) => ({
              id: r.id,
              dia: r.dia,
              tipo: r.tipo,
              hora: horaDe(r.momento, config.fusoHorario),
            })),
          )}
          hoje={hoje}
        />

        {solicitacoes.length > 0 && (
          <div className="cartao overflow-hidden">
            <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-800">
              Minhas solicitações
            </h2>
            <ul className="divide-y divide-slate-100">
              {solicitacoes.map((s) => (
                <li key={s.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{diaBr(s.dia)}</span>
                    <span className="text-slate-700">
                      {s.acao === "INCLUIR" ? "incluir" : s.acao === "ALTERAR" ? "corrigir" : "excluir"}{" "}
                      {s.horario ?? ""}
                    </span>
                    <EtiquetaStatus status={s.status} />
                  </div>
                  <p className="mt-0.5 text-xs italic text-slate-500">“{s.motivo}”</p>
                  {s.respostaAdmin && (
                    <p className="mt-0.5 text-xs text-slate-600">
                      <strong>RH:</strong> {s.respostaAdmin}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </>
  );
}

function Indicador({
  titulo,
  valor,
  cor = "text-slate-900",
}: {
  titulo: string;
  valor: string;
  cor?: string;
}) {
  return (
    <div className="cartao p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`text-xl font-bold tabular-nums ${cor}`}>{valor}</p>
    </div>
  );
}
