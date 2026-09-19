import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { totemDaApi } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { descriptorValido } from "@/lib/face";
import { identificarNoTotem, MENSAGEM_TOTEM } from "@/lib/totem";
import { aplicarAjuste } from "@/lib/ajustes";
import { ipDaRequisicao } from "@/lib/requisicao";
import { limitar } from "@/lib/limite";

const corpo = z.object({
  solicitacaoId: z.string().min(1),
  decisao: z.enum(["CONFIRMAR", "RECUSAR"]),
  descriptor: z.array(z.number()).length(128),
  matricula: z.string().trim().max(20).nullable().optional(),
});

/**
 * De-acordo do funcionário, dado no totem, sobre um ajuste proposto pelo admin.
 *
 * Exige o rosto de novo em vez de confiar na tela: a sessão do tablet é do
 * totem, não da pessoa, e qualquer um que passasse na frente poderia confirmar
 * um desconto de horas alheio. Aqui o servidor reidentifica e só aceita se o
 * rosto reconhecido for o dono da solicitação.
 */
export async function POST(req: Request) {
  const totem = await totemDaApi();
  if (!totem) return NextResponse.json({ erro: "Sessão do totem expirada." }, { status: 401 });

  const { permitido } = limitar(`totem:confirmar:${totem.id}`, 30, 60);
  if (!permitido) {
    return NextResponse.json({ erro: "Muitas tentativas seguidas. Aguarde." }, { status: 429 });
  }

  const parse = corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success || !descriptorValido(parse.data.descriptor)) {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }
  const dados = parse.data;
  const config = await obterConfig();

  const resultado = await identificarNoTotem(dados.descriptor, config, dados.matricula ?? null);
  if (resultado.situacao !== "IDENTIFICADO") {
    return NextResponse.json(
      { erro: MENSAGEM_TOTEM[resultado.situacao], situacao: resultado.situacao },
      { status: 401 },
    );
  }
  const { funcionario } = resultado;

  const solicitacao = await prisma.solicitacao.findUnique({ where: { id: dados.solicitacaoId } });
  if (!solicitacao || solicitacao.usuarioId !== funcionario.id) {
    return NextResponse.json(
      { erro: "Este ajuste não é seu. Peça ao responsável para conferir." },
      { status: 404 },
    );
  }
  if (solicitacao.status !== "AGUARDANDO_FUNCIONARIO") {
    return NextResponse.json({ erro: "Este ajuste já foi respondido." }, { status: 409 });
  }

  if (dados.decisao === "RECUSAR") {
    await prisma.solicitacao.update({
      where: { id: solicitacao.id },
      data: {
        status: "REJEITADA",
        respostaAdmin: "Recusado pelo funcionário no totem.",
      },
    });
    await prisma.auditoria.create({
      data: {
        usuarioId: funcionario.id,
        acao: "AJUSTE_RECUSADO_NO_TOTEM",
        detalhe: `${solicitacao.dia} ${solicitacao.acao} ${solicitacao.tipo}`,
        ip: ipDaRequisicao(req),
      },
    });
    return NextResponse.json({ ok: true, status: "REJEITADA" });
  }

  await prisma.$transaction(async (tx) => {
    await aplicarAjuste(tx, solicitacao, config.fusoHorario, solicitacao.propostaPorId);
    await tx.solicitacao.update({
      where: { id: solicitacao.id },
      data: {
        status: "APROVADA",
        revisadoPorId: solicitacao.propostaPorId,
        revisadoEm: new Date(),
      },
    });
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: funcionario.id,
      acao: "AJUSTE_CONFIRMADO_NO_TOTEM",
      detalhe: `${solicitacao.dia} ${solicitacao.acao} ${solicitacao.tipo} ${solicitacao.horario ?? ""}`.trim(),
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true, status: "APROVADA" });
}
