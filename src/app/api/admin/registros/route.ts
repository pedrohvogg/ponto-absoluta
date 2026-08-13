import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminDaApi } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { paraUtc } from "@/lib/datas";
import { esquemaDia, esquemaHora, primeiroErro } from "@/lib/validacao";
import { ipDaRequisicao } from "@/lib/requisicao";

const corpo = z.object({
  usuarioId: z.string().min(1),
  dia: esquemaDia,
  hora: esquemaHora,
  tipo: z.enum(["ENTRADA", "INICIO_INTERVALO", "FIM_INTERVALO", "SAIDA"]),
  observacao: z.string().trim().min(3, "Descreva o motivo do lançamento manual.").max(300),
});

/** Lançamento manual feito pelo administrador (esquecimento, falha de câmera etc.). */
export async function POST(req: Request) {
  const admin = await adminDaApi();
  if (!admin) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const parse = corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: primeiroErro(parse.error) }, { status: 400 });
  }
  const dados = parse.data;

  const alvo = await prisma.usuario.findUnique({
    where: { id: dados.usuarioId },
    select: { nome: true },
  });
  if (!alvo) return NextResponse.json({ erro: "Funcionário não encontrado." }, { status: 404 });

  const config = await obterConfig();
  const momento = paraUtc(dados.dia, dados.hora, config.fusoHorario);
  if (momento.getTime() > Date.now() + 60_000) {
    return NextResponse.json({ erro: "Não é possível lançar um ponto no futuro." }, { status: 400 });
  }

  const registro = await prisma.registro.create({
    data: {
      usuarioId: dados.usuarioId,
      tipo: dados.tipo,
      momento,
      dia: dados.dia,
      origem: "MANUAL",
      observacao: dados.observacao,
      lancadoPorId: admin.id,
      ip: ipDaRequisicao(req),
    },
    select: { id: true },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: admin.id,
      acao: "REGISTRO_MANUAL",
      detalhe: `${alvo.nome} ${dados.dia} ${dados.hora} ${dados.tipo}`,
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true, registro });
}
