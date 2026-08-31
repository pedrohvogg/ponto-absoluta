import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { obterConfig } from "@/lib/config";
import { espelhoDePonto } from "@/lib/consultas";
import { ROTULO_TIPO, totalizar } from "@/lib/jornada";
import {
  diaBr,
  diaSemanaCurto,
  hojeStr,
  horaDe,
  limitesDoMes,
  minutosParaHoras,
} from "@/lib/datas";
import BotaoImprimir from "@/components/BotaoImprimir";

export const dynamic = "force-dynamic";

export default async function PaginaRelatorios({
  searchParams,
}: {
  searchParams: Promise<{ funcionarioId?: string; de?: string; ate?: string }>;
}) {
  const config = await obterConfig();
  const hoje = hojeStr(config.fusoHorario);
  const mes = limitesDoMes(hoje);
  const { funcionarioId, de = mes.de, ate = mes.ate } = await searchParams;

  const funcionarios = await prisma.usuario.findMany({
    where: { papel: "FUNCIONARIO" },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, ativo: true },
  });

  const espelho = funcionarioId ? await espelhoDePonto(funcionarioId, de, ate) : null;
  const totais = espelho ? totalizar(espelho.jornadas) : null;

  const parametros = new URLSearchParams({ de, ate, ...(funcionarioId ? { funcionarioId } : {}) });

  return (
    <div className="space-y-5">
      <div className="nao-imprimir">
        <h1 className="text-xl font-bold text-slate-900">Espelho de ponto</h1>
        <p className="text-sm text-slate-500">
          Relatório por funcionário e período, pronto para conferência, impressão ou exportação.
        </p>
      </div>

      <form className="cartao nao-imprimir flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="funcionarioId" className="rotulo text-xs">
            Funcionário
          </label>
          <select
            id="funcionarioId"
            name="funcionarioId"
            defaultValue={funcionarioId ?? ""}
            className="campo py-1.5"
          >
            <option value="">Selecione…</option>
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
        <button className="botao-primario py-2">Gerar</button>
        <Link href={`/api/relatorios/csv?${parametros}`} className="botao-secundario py-2">
          ⬇ CSV
        </Link>
        {espelho && <BotaoImprimir />}
      </form>

      {!espelho ? (
        <div className="cartao p-8 text-center text-slate-500">
          Selecione um funcionário para gerar o espelho de ponto.
          <p className="mt-2 text-xs">
            Dica: o CSV também funciona sem selecionar ninguém — nesse caso exporta todos os
            funcionários do período.
          </p>
        </div>
      ) : (
        <div className="cartao p-5">
          <header className="mb-4 border-b border-slate-200 pb-3">
            <h2 className="text-lg font-bold text-slate-900">{config.nomeEmpresa}</h2>
            <p className="text-sm text-slate-600">
              Espelho de ponto · {espelho.usuario.nome} · matrícula {espelho.usuario.matricula}
            </p>
            <p className="text-xs text-slate-500">
              Período: {diaBr(espelho.de)} a {diaBr(espelho.ate)}
              {espelho.ate !== ate && " (até hoje)"} · Jornada:{" "}
              {espelho.usuario.entradaPrevista}–{espelho.usuario.saidaPrevista} (
              {minutosParaHoras(espelho.usuario.cargaDiariaMinutos)}/dia)
            </p>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-2">Dia</th>
                  <th className="py-2 pr-2">Batidas</th>
                  <th className="py-2 pr-2 text-right">Trabalhado</th>
                  <th className="py-2 pr-2 text-right">Previsto</th>
                  <th className="py-2 pr-2 text-right">Saldo</th>
                  <th className="py-2">Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {espelho.jornadas.map((j) => (
                  <tr key={j.dia} className={j.diaUtil ? "" : "bg-slate-50/60"}>
                    <td className="whitespace-nowrap py-1.5 pr-2 font-mono text-xs">
                      {diaBr(j.dia)} <span className="text-slate-400">{diaSemanaCurto(j.dia)}</span>
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-xs tabular-nums">
                      {j.detalhes.length === 0
                        ? j.diaUtil
                          ? "sem registro"
                          : "—"
                        : j.detalhes
                            .map(
                              (r) =>
                                `${horaDe(r.momento, config.fusoHorario)}${
                                  // Só lançamento humano leva asterisco; totem é automático.
                                  r.origem === "MANUAL" || r.origem === "AJUSTE" ? "*" : ""
                                }`,
                            )
                            .join(" · ")}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                      {minutosParaHoras(j.trabalhado)}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-slate-500">
                      {minutosParaHoras(j.previsto)}
                    </td>
                    <td
                      className={`py-1.5 pr-2 text-right font-mono tabular-nums ${
                        j.saldo < 0 ? "text-red-600" : j.saldo > 0 ? "text-emerald-600" : ""
                      }`}
                    >
                      {minutosParaHoras(j.saldo)}
                    </td>
                    <td className="py-1.5 text-xs text-slate-500">
                      {[
                        j.atrasoMinutos > 0 ? `atraso ${minutosParaHoras(j.atrasoMinutos)}` : null,
                        j.inconsistente ? "sequência incompleta" : null,
                        j.emAndamento ? "em aberto" : null,
                        j.detalhes.find((r) => r.observacao)?.observacao ?? null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 font-semibold">
                <tr>
                  <td className="py-2 pr-2">Totais</td>
                  <td className="py-2 pr-2 text-xs font-normal text-slate-500">
                    {totais!.diasTrabalhados} dia(s) com registro
                  </td>
                  <td className="py-2 pr-2 text-right font-mono tabular-nums">
                    {minutosParaHoras(totais!.trabalhado)}
                  </td>
                  <td className="py-2 pr-2 text-right font-mono tabular-nums">
                    {minutosParaHoras(totais!.previsto)}
                  </td>
                  <td
                    className={`py-2 pr-2 text-right font-mono tabular-nums ${
                      totais!.saldo < 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {minutosParaHoras(totais!.saldo)}
                  </td>
                  <td className="py-2 text-xs font-normal text-slate-500">
                    extras {minutosParaHoras(totais!.extras)} · débito{" "}
                    {minutosParaHoras(totais!.devendo)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-4 text-[11px] text-slate-500">
            * batida lançada manualmente ou por ajuste aprovado. Emitido em{" "}
            {new Date().toLocaleString("pt-BR", { timeZone: config.fusoHorario })}.
          </p>

          <div className="mt-10 hidden grid-cols-2 gap-8 print:grid">
            <div className="border-t border-slate-400 pt-1 text-center text-xs">
              Assinatura do funcionário
            </div>
            <div className="border-t border-slate-400 pt-1 text-center text-xs">
              Assinatura do responsável
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
