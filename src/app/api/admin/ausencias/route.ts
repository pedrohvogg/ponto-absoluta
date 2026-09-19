import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDaApi } from "@/lib/auth";
import { conflita } from "@/lib/ausencia";
import { esquemaAusencia, primeiroErro } from "@/lib/validacao";
import { ipDaRequisicao } from "@/lib/requisicao";

/** Agenda uma ausência (férias, folga, atestado). Nasce AGENDADA, sem abonar. */
export async function POST(req: Request) {
  const admin = await adminDaApi();
  if (!admin) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const parse = esquemaAusencia.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: primeiroErro(parse.error) }, { status: 400 });
  }
  const dados = parse.data;

  const funcionario = await prisma.usuario.findUnique({
    where: { id: dados.usuarioId },
    select: { id: true, nome: true, papel: true },
  });
  if (!funcionario || funcionario.papel !== "FUNCIONARIO") {
    return NextResponse.json({ erro: "Funcionário inválido." }, { status: 400 });
  }

  // Dois períodos sobrepostos deixariam o abono do dia ambíguo — e abririam
  // espaço para lançar férias em cima de férias sem ninguém notar.
  const vizinhas = await prisma.ausencia.findMany({
    where: {
      usuarioId: dados.usuarioId,
      status: { in: ["AGENDADA", "VALIDADA"] },
      inicio: { lte: dados.fim },
      fim: { gte: dados.inicio },
    },
    select: { inicio: true, fim: true },
  });
  if (vizinhas.some((v) => conflita(v, dados))) {
    return NextResponse.json(
      { erro: "Já existe um período lançado que se sobrepõe a estas datas." },
      { status: 409 },
    );
  }

  const ausencia = await prisma.ausencia.create({
    data: {
      usuarioId: dados.usuarioId,
      tipo: dados.tipo,
      inicio: dados.inicio,
      fim: dados.fim,
      observacao: dados.observacao || null,
      criadoPorId: admin.id,
    },
    select: { id: true },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: admin.id,
      acao: "AUSENCIA_AGENDADA",
      detalhe: `${funcionario.nome} ${dados.tipo} ${dados.inicio} a ${dados.fim}`,
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true, ausencia });
}
