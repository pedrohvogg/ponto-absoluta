import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { usuarioDaApi } from "@/lib/auth";
import { criarSessao } from "@/lib/sessao";
import { ipDaRequisicao } from "@/lib/requisicao";

/** Registra o aceite do termo de uso de imagem/biometria (LGPD). */
export async function POST(req: Request) {
  const sessao = await usuarioDaApi();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (sessao.papel !== "FUNCIONARIO") {
    return NextResponse.json({ erro: "Este termo não se aplica a esta conta." }, { status: 403 });
  }
  if (sessao.termoAceito) {
    return NextResponse.json({ ok: true, destino: "/ponto" });
  }

  const agora = new Date();
  await prisma.usuario.update({
    where: { id: sessao.id },
    data: { termoAceiteEm: agora },
  });
  await prisma.auditoria.create({
    data: {
      usuarioId: sessao.id,
      acao: "TERMO_IMAGEM_ACEITO",
      detalhe: `Consentimento de uso de imagem/biometria facial registrado em ${agora.toISOString()}`,
      ip: ipDaRequisicao(req),
    },
  });

  // Refaz o cookie para liberar o acesso a partir de agora.
  await criarSessao({ ...sessao, termoAceito: true });

  return NextResponse.json({ ok: true, destino: "/ponto" });
}
