import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminDaApi } from "@/lib/auth";
import { primeiroErro } from "@/lib/validacao";
import { ipDaRequisicao } from "@/lib/requisicao";

const corpo = z.object({ decisao: z.enum(["VALIDAR", "CANCELAR"]) });

/**
 * Valida ou cancela uma ausência agendada.
 *
 * A validação é o que faz o período abonar de verdade: enquanto está apenas
 * AGENDADA, o espelho continua cobrando a jornada. Isso existe para que marcar
 * férias e perdoar horas sejam dois atos separados e auditáveis.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminDaApi();
  if (!admin) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const parse = corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: primeiroErro(parse.error) }, { status: 400 });
  }

  const ausencia = await prisma.ausencia.findUnique({
    where: { id },
    include: { usuario: { select: { nome: true } } },
  });
  if (!ausencia) return NextResponse.json({ erro: "Período não encontrado." }, { status: 404 });

  const validar = parse.data.decisao === "VALIDAR";
  if (validar && ausencia.status === "VALIDADA") {
    return NextResponse.json({ erro: "Este período já está validado." }, { status: 409 });
  }
  if (!validar && ausencia.status === "CANCELADA") {
    return NextResponse.json({ erro: "Este período já está cancelado." }, { status: 409 });
  }

  await prisma.ausencia.update({
    where: { id },
    data: validar
      ? { status: "VALIDADA", validadoPorId: admin.id, validadoEm: new Date() }
      : { status: "CANCELADA", validadoPorId: admin.id, validadoEm: new Date() },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: admin.id,
      acao: validar ? "AUSENCIA_VALIDADA" : "AUSENCIA_CANCELADA",
      detalhe: `${ausencia.usuario.nome} ${ausencia.tipo} ${ausencia.inicio} a ${ausencia.fim}`,
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true });
}

/** Remove um período lançado por engano. Só antes de validar. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminDaApi();
  if (!admin) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const ausencia = await prisma.ausencia.findUnique({
    where: { id },
    include: { usuario: { select: { nome: true } } },
  });
  if (!ausencia) return NextResponse.json({ erro: "Período não encontrado." }, { status: 404 });
  if (ausencia.status === "VALIDADA") {
    return NextResponse.json(
      { erro: "Um período já validado não é apagado: cancele-o, para o histórico ficar registrado." },
      { status: 409 },
    );
  }

  await prisma.ausencia.delete({ where: { id } });
  await prisma.auditoria.create({
    data: {
      usuarioId: admin.id,
      acao: "AUSENCIA_REMOVIDA",
      detalhe: `${ausencia.usuario.nome} ${ausencia.tipo} ${ausencia.inicio} a ${ausencia.fim}`,
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true });
}
