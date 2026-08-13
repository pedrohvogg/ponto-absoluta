import { adminDaApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { obterConfig } from "@/lib/config";
import { espelhoDePonto } from "@/lib/consultas";
import { diaBr, hojeStr, horaDe, limitesDoMes, minutosParaHoras } from "@/lib/datas";
import { ROTULO_TIPO, totalizar } from "@/lib/jornada";
import { DIA_REGEX } from "@/lib/validacao";

/**
 * Exporta o espelho de ponto em CSV (separador ";" e BOM, para abrir
 * corretamente no Excel em português).
 */
export async function GET(req: Request) {
  const admin = await adminDaApi();
  if (!admin) return new Response("Sem permissão.", { status: 403 });

  const url = new URL(req.url);
  const config = await obterConfig();
  const mes = limitesDoMes(hojeStr(config.fusoHorario));
  const de = validarDia(url.searchParams.get("de")) ?? mes.de;
  const ate = validarDia(url.searchParams.get("ate")) ?? mes.ate;
  const funcionarioId = url.searchParams.get("funcionarioId");

  const ids = funcionarioId
    ? [funcionarioId]
    : (
        await prisma.usuario.findMany({
          where: { papel: "FUNCIONARIO" },
          orderBy: { nome: "asc" },
          select: { id: true },
        })
      ).map((u) => u.id);

  const linhas: string[][] = [
    [
      "Funcionario",
      "Matricula",
      "Data",
      "Batidas",
      "Trabalhado",
      "Previsto",
      "Saldo",
      "Atraso",
      "Observacao",
    ],
  ];

  for (const id of ids) {
    const espelho = await espelhoDePonto(id, de, ate);
    if (!espelho) continue;

    for (const j of espelho.jornadas) {
      if (j.detalhes.length === 0 && !j.diaUtil) continue;
      linhas.push([
        espelho.usuario.nome,
        espelho.usuario.matricula,
        diaBr(j.dia),
        j.detalhes
          .map((r) => `${horaDe(r.momento, config.fusoHorario)} ${ROTULO_TIPO[r.tipo]}`)
          .join(" | "),
        minutosParaHoras(j.trabalhado),
        minutosParaHoras(j.previsto),
        minutosParaHoras(j.saldo),
        j.atrasoMinutos > 0 ? minutosParaHoras(j.atrasoMinutos) : "",
        [
          j.inconsistente ? "sequencia incompleta" : "",
          j.detalhes.find((r) => r.observacao)?.observacao ?? "",
        ]
          .filter(Boolean)
          .join(" · "),
      ]);
    }

    const t = totalizar(espelho.jornadas);
    linhas.push([
      espelho.usuario.nome,
      espelho.usuario.matricula,
      "TOTAL",
      `${t.diasTrabalhados} dia(s)`,
      minutosParaHoras(t.trabalhado),
      minutosParaHoras(t.previsto),
      minutosParaHoras(t.saldo),
      "",
      `extras ${minutosParaHoras(t.extras)} / debito ${minutosParaHoras(t.devendo)}`,
    ]);
    linhas.push([]);
  }

  const csv = linhas.map((l) => l.map(escapar).join(";")).join("\r\n");
  const nome = `espelho-ponto-${de}-a-${ate}.csv`;

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}

function escapar(valor: string): string {
  const limpo = (valor ?? "").replace(/"/g, '""');
  return /[;"\r\n]/.test(limpo) ? `"${limpo}"` : limpo;
}

function validarDia(valor: string | null): string | null {
  return valor && DIA_REGEX.test(valor) ? valor : null;
}
