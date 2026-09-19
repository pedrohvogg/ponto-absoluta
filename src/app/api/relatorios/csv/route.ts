import { adminDaApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { obterConfig } from "@/lib/config";
import { espelhoDePonto } from "@/lib/consultas";
import {
  diaBr,
  diaSemanaCurto,
  hojeStr,
  horaDe,
  limitesDoMes,
  minutosParaHoras,
} from "@/lib/datas";
import { ROTULO_AUSENCIA } from "@/lib/ausencia";
import { ROTULO_PENDENCIA, ROTULO_TIPO, totalizar } from "@/lib/jornada";
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
      "Dia",
      "Batidas",
      "Trabalhado",
      "Previsto",
      "Saldo",
      "Saldo (horas)",
      "Intervalo",
      "Atraso",
      "Situacao",
      "Observacao",
    ],
  ];

  for (const id of ids) {
    const espelho = await espelhoDePonto(id, de, ate);
    if (!espelho) continue;

    for (const j of espelho.jornadas) {
      linhas.push([
        espelho.usuario.nome,
        espelho.usuario.matricula,
        diaBr(j.dia),
        diaSemanaCurto(j.dia),
        j.detalhes
          .map((r) => `${horaDe(r.momento, config.fusoHorario)} ${ROTULO_TIPO[r.tipo]}`)
          .join(" | "),
        duracao(j.trabalhado),
        duracao(j.previsto),
        duracao(j.saldo),
        decimal(j.saldo),
        duracao(j.intervalo),
        j.atrasoMinutos > 0 ? duracao(j.atrasoMinutos) : "",
        situacaoDoDia(j),
        [
          j.inconsistente ? "sequencia incompleta" : "",
          // Todas as observações do dia, e não só a primeira: cada batida
          // ajustada carrega o motivo dela, e perder os demais escondia
          // exatamente a informação que se procura numa conferência.
          ...j.detalhes.map((r) => r.observacao).filter(Boolean),
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
      "",
      `${t.diasTrabalhados} dia(s) com registro`,
      duracao(t.trabalhado),
      duracao(t.previsto),
      duracao(t.saldo),
      decimal(t.saldo),
      duracao(t.intervalo),
      "",
      resumoDoPeriodo(t),
      `extras ${duracao(t.extras)} / debito ${duracao(t.devendo)}`,
    ]);
    // Linha em branco com o mesmo número de colunas: um separador mais curto
    // faz leitores estritos de CSV reclamarem do arquivo.
    linhas.push(new Array(linhas[0].length).fill(""));
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

/** Sinal de menos tipográfico: ver `escapar`. */
const MENOS = "−";

/**
 * Duração em HH:mm para leitura.
 *
 * Um saldo negativo sai com o sinal de menos tipográfico (−) em vez do hífen.
 * Motivo concreto: o Excel trata uma célula iniciada por "-" como fórmula, e
 * "-08:00" virava #### na planilha — era esse o erro que aparecia no relatório.
 * O valor para somar vai na coluna "Saldo (horas)".
 */
function duracao(minutos: number): string {
  const texto = minutosParaHoras(minutos);
  return texto.startsWith("-") ? MENOS + texto.slice(1) : texto;
}

/** Mesma duração em horas decimais, com vírgula: o Excel pt-BR soma direto. */
function decimal(minutos: number): string {
  return (minutos / 60).toFixed(2).replace(".", ",");
}

function situacaoDoDia(j: {
  abono: { tipo: keyof typeof ROTULO_AUSENCIA } | null;
  antesDaAdmissao: boolean;
  pendencia: keyof typeof ROTULO_PENDENCIA | null;
  diaUtil: boolean;
  emAndamento: boolean;
  registros: unknown[];
}): string {
  if (j.antesDaAdmissao) return "antes da admissao";
  if (j.abono) return ROTULO_AUSENCIA[j.abono.tipo].toLowerCase();
  if (j.pendencia) return ROTULO_PENDENCIA[j.pendencia];
  if (!j.diaUtil) return j.registros.length > 0 ? "folga trabalhada" : "folga";
  if (j.emAndamento) return "em aberto";
  return "";
}

function resumoDoPeriodo(t: ReturnType<typeof totalizar>): string {
  const partes = [
    t.faltas > 0 ? `${t.faltas} falta(s)` : "",
    t.pendentes > 0 ? `${t.pendentes} dia(s) a regularizar` : "",
    t.abonados > 0 ? `${t.abonados} dia(s) abonado(s)` : "",
    t.atrasos > 0 ? `${t.atrasos} atraso(s)` : "",
  ].filter(Boolean);
  return partes.join(" · ");
}

/** Caracteres que fazem o Excel tratar a célula como fórmula. */
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;
/** Número puro, inclusive negativo com vírgula decimal (ex.: -56,93). */
const NUMERO = /^-?\d+(?:[.,]\d+)?$/;

function escapar(valor: string): string {
  let limpo = (valor ?? "").replace(/"/g, '""');
  // Um nome ou observação que comece com "=" seria executado como fórmula ao
  // abrir a planilha. O apóstrofo neutraliza sem mudar o que se lê na célula.
  //
  // Um número negativo fica de fora: "-56,93" é um valor legítimo, o Excel lê
  // como número e soma. Protegê-lo com apóstrofo o transformaria em texto e
  // quebraria exatamente a coluna criada para poder somar.
  if (INICIO_DE_FORMULA.test(limpo) && !NUMERO.test(limpo)) limpo = `'${limpo}`;
  return /[;"\r\n]/.test(limpo) ? `"${limpo}"` : limpo;
}

function validarDia(valor: string | null): string | null {
  return valor && DIA_REGEX.test(valor) ? valor : null;
}
