import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { totemDaApi } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { confiancaPercentual, descriptorValido } from "@/lib/face";
import { diaDe, horaDe, limitesDoDia } from "@/lib/datas";
import { proximoTipo, ROTULO_TIPO } from "@/lib/jornada";
import { identificarNoTotem, MENSAGEM_TOTEM } from "@/lib/totem";
import { ipDaRequisicao } from "@/lib/requisicao";
import { limitar } from "@/lib/limite";

const corpo = z.object({
  descriptor: z.array(z.number()).length(128),
  /** Preenchida quando a identificação automática ficou em dúvida. */
  matricula: z.string().trim().max(20).nullable().optional(),
});

/** Descobre quem está na frente da câmera, sem registrar nada ainda. */
export async function POST(req: Request) {
  const totem = await totemDaApi();
  if (!totem) return NextResponse.json({ erro: "Sessão do totem expirada." }, { status: 401 });

  // O totem faz muitas leituras por minuto; o teto é só contra laço descontrolado.
  const { permitido } = limitar(`totem:identificar:${totem.id}`, 120, 60);
  if (!permitido) {
    return NextResponse.json({ erro: "Muitas leituras seguidas. Aguarde." }, { status: 429 });
  }

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
    // Só vira auditoria o que exige atenção do responsável; leitura de rosto de
    // passante (DESCONHECIDO) aconteceria o tempo todo e viraria ruído.
    if (resultado.situacao === "ROSTO_NAO_CONFERE") {
      await prisma.auditoria.create({
        data: {
          usuarioId: totem.id,
          acao: "TOTEM_ROSTO_NAO_CONFERE",
          detalhe: `matrícula digitada: ${parse.data.matricula ?? "—"}`,
          ip: ipDaRequisicao(req),
        },
      });
    }
    return NextResponse.json({
      situacao: resultado.situacao,
      mensagem: MENSAGEM_TOTEM[resultado.situacao],
      /** Diz ao totem para já abrir o teclado numérico. */
      pedirMatricula: resultado.situacao === "AMBIGUO",
    });
  }

  const { funcionario, distancia } = resultado;
  const dia = diaDe(new Date(), config.fusoHorario);
  const { inicio, fim } = limitesDoDia(dia, config.fusoHorario);

  const registrosHoje = await prisma.registro.findMany({
    where: { usuarioId: funcionario.id, momento: { gte: inicio, lt: fim } },
    orderBy: { momento: "asc" },
    select: { tipo: true, momento: true },
  });

  const tipoSugerido = proximoTipo(registrosHoje);

  return NextResponse.json({
    situacao: "IDENTIFICADO",
    funcionario: {
      nome: funcionario.nome,
      primeiroNome: funcionario.nome.split(" ")[0],
      matricula: funcionario.matricula,
      cargo: funcionario.cargo,
    },
    /** Nulo enquanto a pessoa não tiver aceitado o termo de imagem no totem. */
    termoAceito: funcionario.termoAceiteEm !== null,
    confianca: confiancaPercentual(distancia),
    tipoSugerido,
    rotuloSugerido: ROTULO_TIPO[tipoSugerido],
    batidasHoje: registrosHoje.map((r) => ({
      tipo: r.tipo,
      rotulo: ROTULO_TIPO[r.tipo],
      hora: horaDe(r.momento, config.fusoHorario),
    })),
  });
}
