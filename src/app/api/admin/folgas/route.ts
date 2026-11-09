import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminDaApi } from "@/lib/auth";
import { folgasDaSemana, segundaDaSemana } from "@/lib/folgas";
import { esquemaDia, primeiroErro } from "@/lib/validacao";
import { ipDaRequisicao } from "@/lib/requisicao";

const esquemaSemana = esquemaDia.refine((d) => segundaDaSemana(d) === d, {
  message: "A semana deve começar numa segunda-feira.",
});

const corpoMarcar = z.object({
  usuarioId: z.string().min(1),
  semana: esquemaSemana,
  diaSemana: z.number().int().min(0).max(6),
  folga: z.boolean(),
});

/**
 * Marca ou desmarca a folga de um funcionário num dia da semana.
 *
 * Recebe a intenção ("folga na quarta: sim/não") e não a lista inteira de
 * dias: quem decide o que já estava em vigor é o servidor, inclusive quando a
 * semana ainda repetia a anterior. Assim um clique numa semana herdada grava
 * a semana completa — a herança mais a mudança — e nada se perde.
 */
export async function POST(req: Request) {
  const admin = await adminDaApi();
  if (!admin) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const parse = corpoMarcar.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: primeiroErro(parse.error) }, { status: 400 });
  }
  const { usuarioId, semana, diaSemana, folga } = parse.data;

  const funcionario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { papel: true, nome: true },
  });
  if (!funcionario || funcionario.papel !== "FUNCIONARIO") {
    return NextResponse.json({ erro: "Funcionário inválido." }, { status: 400 });
  }

  const marcadas = await prisma.folgaSemanal.findMany({
    where: { usuarioId, semana: { lte: semana } },
    select: { semana: true, dias: true },
  });
  const atuais = folgasDaSemana(marcadas, semana)?.dias ?? [];
  const dias = folga
    ? [...new Set([...atuais, diaSemana])].sort((a, b) => a - b)
    : atuais.filter((d) => d !== diaSemana);

  await prisma.folgaSemanal.upsert({
    where: { usuarioId_semana: { usuarioId, semana } },
    create: { usuarioId, semana, dias, atualizadoPorId: admin.id },
    update: { dias, atualizadoPorId: admin.id },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: admin.id,
      acao: folga ? "FOLGA_MARCADA" : "FOLGA_DESMARCADA",
      detalhe: `${funcionario.nome} semana=${semana} dia=${diaSemana}`,
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true, dias });
}

const corpoRepetir = z.object({ semana: esquemaSemana });

/**
 * Desfaz as marcações de uma semana inteira: ela volta a repetir a última
 * semana marcada antes dela.
 */
export async function DELETE(req: Request) {
  const admin = await adminDaApi();
  if (!admin) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const parse = corpoRepetir.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: primeiroErro(parse.error) }, { status: 400 });
  }
  const { semana } = parse.data;

  const { count } = await prisma.folgaSemanal.deleteMany({ where: { semana } });

  await prisma.auditoria.create({
    data: {
      usuarioId: admin.id,
      acao: "FOLGAS_DA_SEMANA_DESFEITAS",
      detalhe: `semana=${semana} registros=${count}`,
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true, removidas: count });
}
