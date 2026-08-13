import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminDaApi } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { paraUtc } from "@/lib/datas";
import { primeiroErro } from "@/lib/validacao";
import { ipDaRequisicao } from "@/lib/requisicao";

const corpo = z.object({
  decisao: z.enum(["APROVAR", "REJEITAR"]),
  resposta: z.string().trim().max(500).optional(),
});

/**
 * Decide uma solicitação de ajuste. Aprovar aplica a mudança no espelho de
 * ponto (inclui, altera ou exclui a batida) dentro da mesma transação.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminDaApi();
  if (!admin) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const parse = corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: primeiroErro(parse.error) }, { status: 400 });
  }
  const { decisao, resposta } = parse.data;

  const solicitacao = await prisma.solicitacao.findUnique({
    where: { id },
    include: { usuario: { select: { nome: true } } },
  });
  if (!solicitacao) return NextResponse.json({ erro: "Solicitação não encontrada." }, { status: 404 });
  if (solicitacao.status !== "PENDENTE") {
    return NextResponse.json({ erro: "Esta solicitação já foi analisada." }, { status: 409 });
  }

  if (decisao === "REJEITAR") {
    if (!resposta) {
      return NextResponse.json(
        { erro: "Explique ao funcionário o motivo da recusa." },
        { status: 400 },
      );
    }
    await prisma.solicitacao.update({
      where: { id },
      data: {
        status: "REJEITADA",
        respostaAdmin: resposta,
        revisadoPorId: admin.id,
        revisadoEm: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  }

  const config = await obterConfig();

  await prisma.$transaction(async (tx) => {
    if (solicitacao.acao === "INCLUIR" && solicitacao.horario) {
      await tx.registro.create({
        data: {
          usuarioId: solicitacao.usuarioId,
          tipo: solicitacao.tipo,
          momento: paraUtc(solicitacao.dia, solicitacao.horario, config.fusoHorario),
          dia: solicitacao.dia,
          origem: "AJUSTE",
          observacao: `Ajuste aprovado: ${solicitacao.motivo}`,
          lancadoPorId: admin.id,
        },
      });
    } else if (solicitacao.acao === "ALTERAR" && solicitacao.registroAlvoId && solicitacao.horario) {
      await tx.registro.update({
        where: { id: solicitacao.registroAlvoId },
        data: {
          momento: paraUtc(solicitacao.dia, solicitacao.horario, config.fusoHorario),
          tipo: solicitacao.tipo,
          origem: "AJUSTE",
          observacao: `Ajuste aprovado: ${solicitacao.motivo}`,
          lancadoPorId: admin.id,
        },
      });
    } else if (solicitacao.acao === "EXCLUIR" && solicitacao.registroAlvoId) {
      await tx.registro.deleteMany({ where: { id: solicitacao.registroAlvoId } });
    }

    await tx.solicitacao.update({
      where: { id },
      data: {
        status: "APROVADA",
        respostaAdmin: resposta ?? null,
        revisadoPorId: admin.id,
        revisadoEm: new Date(),
      },
    });
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: admin.id,
      acao: "AJUSTE_APROVADO",
      detalhe: `${solicitacao.usuario.nome} ${solicitacao.dia} ${solicitacao.acao} ${solicitacao.tipo} ${solicitacao.horario ?? ""}`.trim(),
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true });
}
