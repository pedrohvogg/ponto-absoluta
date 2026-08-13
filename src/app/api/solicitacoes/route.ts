import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { usuarioDaApi } from "@/lib/auth";
import { hojeStr } from "@/lib/datas";
import { obterConfig } from "@/lib/config";
import { esquemaDia, esquemaHora, primeiroErro } from "@/lib/validacao";

const corpo = z
  .object({
    acao: z.enum(["INCLUIR", "ALTERAR", "EXCLUIR"]),
    dia: esquemaDia,
    tipo: z.enum(["ENTRADA", "INICIO_INTERVALO", "FIM_INTERVALO", "SAIDA"]),
    horario: esquemaHora.nullable().optional(),
    registroAlvoId: z.string().nullable().optional(),
    motivo: z.string().trim().min(10, "Explique o motivo com pelo menos 10 caracteres.").max(500),
  })
  .refine((d) => d.acao === "EXCLUIR" || !!d.horario, {
    message: "Informe o horário solicitado.",
    path: ["horario"],
  })
  .refine((d) => d.acao === "INCLUIR" || !!d.registroAlvoId, {
    message: "Selecione o registro que deseja corrigir.",
    path: ["registroAlvoId"],
  });

/** Solicitação de ajuste feita pelo próprio funcionário. */
export async function POST(req: Request) {
  const sessao = await usuarioDaApi();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });

  const parse = corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: primeiroErro(parse.error) }, { status: 400 });
  }
  const dados = parse.data;
  const config = await obterConfig();

  if (dados.dia > hojeStr(config.fusoHorario)) {
    return NextResponse.json({ erro: "Não é possível pedir ajuste para uma data futura." }, { status: 400 });
  }

  if (dados.registroAlvoId) {
    const alvo = await prisma.registro.findUnique({
      where: { id: dados.registroAlvoId },
      select: { usuarioId: true },
    });
    if (!alvo || alvo.usuarioId !== sessao.id) {
      return NextResponse.json({ erro: "Registro inválido." }, { status: 400 });
    }
  }

  const jaPendentes = await prisma.solicitacao.count({
    where: { usuarioId: sessao.id, status: "PENDENTE" },
  });
  if (jaPendentes >= 20) {
    return NextResponse.json(
      { erro: "Você já tem muitas solicitações pendentes. Aguarde a análise." },
      { status: 429 },
    );
  }

  const solicitacao = await prisma.solicitacao.create({
    data: {
      usuarioId: sessao.id,
      acao: dados.acao,
      dia: dados.dia,
      tipo: dados.tipo,
      horario: dados.horario ?? null,
      registroAlvoId: dados.registroAlvoId ?? null,
      motivo: dados.motivo,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, solicitacao });
}
