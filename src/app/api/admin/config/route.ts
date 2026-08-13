import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDaApi } from "@/lib/auth";
import { esquemaConfig, primeiroErro } from "@/lib/validacao";
import { ipDaRequisicao } from "@/lib/requisicao";

export async function PATCH(req: Request) {
  const admin = await adminDaApi();
  if (!admin) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const parse = esquemaConfig.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: primeiroErro(parse.error) }, { status: 400 });
  }
  const dados = parse.data;

  if (dados.geofenceAtiva && (dados.latitude == null || dados.longitude == null)) {
    return NextResponse.json(
      { erro: "Defina a localização da empresa antes de ativar a cerca virtual." },
      { status: 400 },
    );
  }

  try {
    // Valida o fuso antes de gravar: um valor errado quebraria todos os cálculos.
    new Intl.DateTimeFormat("pt-BR", { timeZone: dados.fusoHorario }).format(new Date());
  } catch {
    return NextResponse.json({ erro: "Fuso horário inválido." }, { status: 400 });
  }

  const config = await prisma.config.upsert({
    where: { id: "default" },
    update: dados,
    create: { id: "default", ...dados },
  });

  await prisma.auditoria.create({
    data: { usuarioId: admin.id, acao: "CONFIG_ATUALIZADA", ip: ipDaRequisicao(req) },
  });

  return NextResponse.json({ ok: true, config });
}
