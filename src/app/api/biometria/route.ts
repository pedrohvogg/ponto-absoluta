import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { usuarioDaApi } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { descriptorValido, melhorDistancia } from "@/lib/face";
import { ipDaRequisicao } from "@/lib/requisicao";

const corpo = z.object({
  descriptor: z.array(z.number()).length(128),
  foto: z.string().nullable().optional(),
  /** Preenchido apenas quando um administrador cadastra o rosto de outra pessoa. */
  usuarioId: z.string().optional(),
});

const MAX_BIOMETRIAS = 5;
const MAX_FOTO = 400_000;

export async function POST(req: Request) {
  const sessao = await usuarioDaApi();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });

  const parse = corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success || !descriptorValido(parse.data.descriptor)) {
    return NextResponse.json({ erro: "Leitura facial inválida." }, { status: 400 });
  }
  const dados = parse.data;

  const alvoId = dados.usuarioId ?? sessao.id;
  if (alvoId !== sessao.id && sessao.papel !== "ADMIN") {
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  }

  const alvo = await prisma.usuario.findUnique({
    where: { id: alvoId },
    select: { id: true, nome: true, papel: true },
  });
  if (!alvo) return NextResponse.json({ erro: "Funcionário não encontrado." }, { status: 404 });

  const config = await obterConfig();

  // Impede que o mesmo rosto seja vinculado a duas pessoas diferentes.
  const deOutros = await prisma.biometria.findMany({
    where: { usuarioId: { not: alvoId } },
    select: { descriptor: true, usuario: { select: { nome: true } } },
  });
  for (const outra of deOutros) {
    if (!descriptorValido(outra.descriptor)) continue;
    const d = melhorDistancia(dados.descriptor, [outra.descriptor as unknown as number[]]);
    if (d !== null && d < config.limiarFacial) {
      return NextResponse.json(
        {
          erro: `Este rosto já está cadastrado para outra pessoa (${outra.usuario.nome}). Fale com o administrador.`,
        },
        { status: 409 },
      );
    }
  }

  const total = await prisma.biometria.count({ where: { usuarioId: alvoId } });
  if (total >= MAX_BIOMETRIAS) {
    return NextResponse.json(
      { erro: `Limite de ${MAX_BIOMETRIAS} capturas atingido. Remova uma antes de cadastrar outra.` },
      { status: 409 },
    );
  }

  const biometria = await prisma.biometria.create({
    data: {
      usuarioId: alvoId,
      descriptor: dados.descriptor,
      fotoBase64: dados.foto && dados.foto.length <= MAX_FOTO ? dados.foto : null,
    },
    select: { id: true, criadoEm: true },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: sessao.id,
      acao: "BIOMETRIA_CADASTRADA",
      detalhe: `alvo=${alvo.nome}`,
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true, biometria, total: total + 1 });
}
