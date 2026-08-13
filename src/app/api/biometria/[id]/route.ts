import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { usuarioDaApi } from "@/lib/auth";
import { ipDaRequisicao } from "@/lib/requisicao";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await usuarioDaApi();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });

  const { id } = await params;
  const biometria = await prisma.biometria.findUnique({
    where: { id },
    select: { id: true, usuarioId: true },
  });
  if (!biometria) return NextResponse.json({ erro: "Captura não encontrada." }, { status: 404 });

  if (biometria.usuarioId !== sessao.id && sessao.papel !== "ADMIN") {
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  }

  await prisma.biometria.delete({ where: { id } });
  await prisma.auditoria.create({
    data: {
      usuarioId: sessao.id,
      acao: "BIOMETRIA_REMOVIDA",
      detalhe: `biometria=${id} alvo=${biometria.usuarioId}`,
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true });
}
