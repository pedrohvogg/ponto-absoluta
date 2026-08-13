import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminDaApi } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { horaDe, paraUtc } from "@/lib/datas";
import { esquemaHora, primeiroErro } from "@/lib/validacao";
import { ipDaRequisicao } from "@/lib/requisicao";

const corpo = z.object({
  hora: esquemaHora.optional(),
  tipo: z.enum(["ENTRADA", "INICIO_INTERVALO", "FIM_INTERVALO", "SAIDA"]).optional(),
  observacao: z.string().trim().min(3, "Descreva o motivo da alteração.").max(300),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminDaApi();
  if (!admin) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const registro = await prisma.registro.findUnique({
    where: { id },
    select: { id: true, dia: true, momento: true, tipo: true, usuario: { select: { nome: true } } },
  });
  if (!registro) return NextResponse.json({ erro: "Registro não encontrado." }, { status: 404 });

  const parse = corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: primeiroErro(parse.error) }, { status: 400 });
  }
  const dados = parse.data;
  const config = await obterConfig();

  const horaAnterior = horaDe(registro.momento, config.fusoHorario);
  const momento = dados.hora ? paraUtc(registro.dia, dados.hora, config.fusoHorario) : undefined;

  await prisma.registro.update({
    where: { id },
    data: {
      momento,
      tipo: dados.tipo,
      observacao: dados.observacao,
      origem: "AJUSTE",
      lancadoPorId: admin.id,
    },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: admin.id,
      acao: "REGISTRO_ALTERADO",
      detalhe: `${registro.usuario.nome} ${registro.dia}: ${registro.tipo} ${horaAnterior} -> ${dados.tipo ?? registro.tipo} ${dados.hora ?? horaAnterior}`,
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminDaApi();
  if (!admin) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const registro = await prisma.registro.findUnique({
    where: { id },
    select: { dia: true, tipo: true, momento: true, usuario: { select: { nome: true } } },
  });
  if (!registro) return NextResponse.json({ erro: "Registro não encontrado." }, { status: 404 });

  const config = await obterConfig();
  await prisma.registro.delete({ where: { id } });
  await prisma.auditoria.create({
    data: {
      usuarioId: admin.id,
      acao: "REGISTRO_EXCLUIDO",
      detalhe: `${registro.usuario.nome} ${registro.dia} ${registro.tipo} ${horaDe(registro.momento, config.fusoHorario)}`,
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true });
}
