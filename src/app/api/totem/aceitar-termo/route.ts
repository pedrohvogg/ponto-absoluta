import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { totemDaApi } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { descriptorValido } from "@/lib/face";
import { identificarNoTotem, MENSAGEM_TOTEM } from "@/lib/totem";
import { ipDaRequisicao } from "@/lib/requisicao";

const corpo = z.object({
  descriptor: z.array(z.number()).length(128),
  matricula: z.string().trim().max(20).nullable().optional(),
});

/**
 * Registra, no totem, o aceite do termo de uso de imagem (LGPD).
 *
 * O consentimento e da propria pessoa: identificamos o rosto de novo no
 * servidor antes de gravar, para que o aceite nunca caia no cadastro errado.
 */
export async function POST(req: Request) {
  const totem = await totemDaApi();
  if (!totem) return NextResponse.json({ erro: "Sessão do totem expirada." }, { status: 401 });

  const parse = corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success || !descriptorValido(parse.data.descriptor)) {
    return NextResponse.json({ erro: "Leitura facial inválida." }, { status: 400 });
  }

  const config = await obterConfig();
  const resultado = await identificarNoTotem(
    parse.data.descriptor,
    config,
    parse.data.matricula ?? null,
  );
  if (resultado.situacao !== "IDENTIFICADO") {
    return NextResponse.json({ erro: MENSAGEM_TOTEM[resultado.situacao] }, { status: 401 });
  }

  const { funcionario } = resultado;
  if (funcionario.termoAceiteEm !== null) {
    return NextResponse.json({ ok: true, jaAceito: true });
  }

  const agora = new Date();
  await prisma.usuario.update({
    where: { id: funcionario.id },
    data: { termoAceiteEm: agora },
  });
  await prisma.auditoria.create({
    data: {
      usuarioId: funcionario.id,
      acao: "TERMO_IMAGEM_ACEITO",
      detalhe: `Aceito no totem da loja em ${agora.toISOString()}`,
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true });
}
