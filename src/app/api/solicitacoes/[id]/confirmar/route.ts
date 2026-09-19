import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { usuarioDaApi } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { aplicarAjuste } from "@/lib/ajustes";
import { primeiroErro } from "@/lib/validacao";
import { ipDaRequisicao } from "@/lib/requisicao";

const corpo = z.object({
  decisao: z.enum(["CONFIRMAR", "RECUSAR"]),
  observacao: z.string().trim().max(500).optional(),
});

/**
 * De-acordo do funcionário no ajuste proposto pelo administrador.
 *
 * Confirmar aplica a mudança no espelho; recusar devolve o caso ao
 * administrador com a justificativa. Só o dono do ponto decide aqui — nem
 * mesmo um administrador logado pode confirmar no lugar dele.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await usuarioDaApi();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });

  const { id } = await params;
  const parse = corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: primeiroErro(parse.error) }, { status: 400 });
  }
  const { decisao, observacao } = parse.data;

  const solicitacao = await prisma.solicitacao.findUnique({ where: { id } });
  if (!solicitacao || solicitacao.usuarioId !== sessao.id) {
    return NextResponse.json({ erro: "Ajuste não encontrado." }, { status: 404 });
  }
  if (solicitacao.status !== "AGUARDANDO_FUNCIONARIO") {
    return NextResponse.json({ erro: "Este ajuste não está aguardando sua confirmação." }, { status: 409 });
  }

  if (decisao === "RECUSAR") {
    if (!observacao) {
      return NextResponse.json(
        { erro: "Diga por que você não concorda, para o responsável entender." },
        { status: 400 },
      );
    }
    await prisma.solicitacao.update({
      where: { id },
      data: { status: "REJEITADA", respostaAdmin: `Recusado pelo funcionário: ${observacao}` },
    });
    await prisma.auditoria.create({
      data: {
        usuarioId: sessao.id,
        acao: "AJUSTE_RECUSADO_PELO_FUNCIONARIO",
        detalhe: `${solicitacao.dia} ${solicitacao.acao} ${solicitacao.tipo}`,
        ip: ipDaRequisicao(req),
      },
    });
    return NextResponse.json({ ok: true, status: "REJEITADA" });
  }

  const config = await obterConfig();

  await prisma.$transaction(async (tx) => {
    await aplicarAjuste(tx, solicitacao, config.fusoHorario, solicitacao.propostaPorId);
    await tx.solicitacao.update({
      where: { id },
      data: {
        status: "APROVADA",
        revisadoPorId: solicitacao.propostaPorId,
        revisadoEm: new Date(),
      },
    });
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: sessao.id,
      acao: "AJUSTE_CONFIRMADO_PELO_FUNCIONARIO",
      detalhe: `${solicitacao.dia} ${solicitacao.acao} ${solicitacao.tipo} ${solicitacao.horario ?? ""}`.trim(),
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true, status: "APROVADA" });
}
