import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDaApi } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { hojeStr } from "@/lib/datas";
import { esquemaPropostaAjuste, primeiroErro } from "@/lib/validacao";
import { ipDaRequisicao } from "@/lib/requisicao";

/**
 * Ajuste proposto pelo administrador.
 *
 * Nasce AGUARDANDO_FUNCIONARIO em vez de já virar registro: mexer no espelho de
 * ponto de alguém sem que a pessoa saiba é justamente o que um sistema de ponto
 * não pode fazer. O de-acordo dela acontece no próximo registro.
 *
 * Para lançar uma batida direto, sem passar pelo funcionário, continua
 * existindo o lançamento manual em /api/admin/registros.
 */
export async function POST(req: Request) {
  const admin = await adminDaApi();
  if (!admin) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const parse = esquemaPropostaAjuste.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: primeiroErro(parse.error) }, { status: 400 });
  }
  const dados = parse.data;
  const config = await obterConfig();

  if (dados.dia > hojeStr(config.fusoHorario)) {
    return NextResponse.json({ erro: "Não é possível ajustar uma data futura." }, { status: 400 });
  }

  const funcionario = await prisma.usuario.findUnique({
    where: { id: dados.usuarioId },
    select: { id: true, nome: true, papel: true, ativo: true },
  });
  if (!funcionario || funcionario.papel !== "FUNCIONARIO") {
    return NextResponse.json({ erro: "Funcionário inválido." }, { status: 400 });
  }
  if (!funcionario.ativo) {
    return NextResponse.json(
      { erro: "Funcionário inativo não tem como confirmar o ajuste." },
      { status: 409 },
    );
  }

  if (dados.registroAlvoId) {
    const alvo = await prisma.registro.findUnique({
      where: { id: dados.registroAlvoId },
      select: { usuarioId: true },
    });
    if (!alvo || alvo.usuarioId !== dados.usuarioId) {
      return NextResponse.json({ erro: "O registro informado não é deste funcionário." }, { status: 400 });
    }
  }

  const solicitacao = await prisma.solicitacao.create({
    data: {
      usuarioId: dados.usuarioId,
      acao: dados.acao,
      dia: dados.dia,
      tipo: dados.tipo,
      horario: dados.horario ?? null,
      registroAlvoId: dados.registroAlvoId ?? null,
      motivo: dados.motivo,
      status: "AGUARDANDO_FUNCIONARIO",
      propostaPorId: admin.id,
    },
    select: { id: true },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: admin.id,
      acao: "AJUSTE_PROPOSTO",
      detalhe: `${funcionario.nome} ${dados.dia} ${dados.acao} ${dados.tipo} ${dados.horario ?? ""}`.trim(),
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true, solicitacao });
}
