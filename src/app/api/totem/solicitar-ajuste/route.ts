import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { totemDaApi } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { descriptorValido } from "@/lib/face";
import { hojeStr } from "@/lib/datas";
import { identificarNoTotem, MENSAGEM_TOTEM } from "@/lib/totem";
import { esquemaDia, esquemaHora, primeiroErro } from "@/lib/validacao";
import { ipDaRequisicao } from "@/lib/requisicao";
import { limitar } from "@/lib/limite";

const corpo = z.object({
  dia: esquemaDia,
  tipo: z.enum(["ENTRADA", "INICIO_INTERVALO", "FIM_INTERVALO", "SAIDA"]),
  horario: esquemaHora,
  motivo: z.string().trim().min(10, "Escolha um motivo.").max(500),
  descriptor: z.array(z.number()).length(128),
  matricula: z.string().trim().max(20).nullable().optional(),
});

/**
 * Pedido de ajuste feito pelo próprio funcionário, no totem.
 *
 * Quem bate ponto só pelo tablet não tem login: sem esta rota, a única forma
 * de regularizar um dia esquecido seria pedir ao administrador de viva voz, e
 * o pedido não ficaria registrado em lugar nenhum.
 *
 * O rosto é reidentificado aqui, como no registro: a sessão aberta no tablet é
 * a do totem, então é o rosto — e não a tela — que diz de quem é o pedido.
 */
export async function POST(req: Request) {
  const totem = await totemDaApi();
  if (!totem) return NextResponse.json({ erro: "Sessão do totem expirada." }, { status: 401 });

  const { permitido } = limitar(`totem:solicitar:${totem.id}`, 20, 60);
  if (!permitido) {
    return NextResponse.json({ erro: "Muitos pedidos seguidos. Aguarde." }, { status: 429 });
  }

  const parse = corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: primeiroErro(parse.error) }, { status: 400 });
  }
  const dados = parse.data;
  if (!descriptorValido(dados.descriptor)) {
    return NextResponse.json({ erro: "Leitura facial inválida." }, { status: 400 });
  }

  const config = await obterConfig();
  if (dados.dia > hojeStr(config.fusoHorario)) {
    return NextResponse.json({ erro: "Não dá para pedir ajuste de um dia futuro." }, { status: 400 });
  }

  const resultado = await identificarNoTotem(dados.descriptor, config, dados.matricula ?? null);
  if (resultado.situacao !== "IDENTIFICADO") {
    return NextResponse.json(
      { erro: MENSAGEM_TOTEM[resultado.situacao], situacao: resultado.situacao },
      { status: 401 },
    );
  }
  const { funcionario } = resultado;

  // Um toque a mais no botão não pode virar dois pedidos para o mesmo dia: o
  // administrador veria pedidos repetidos sem saber qual é o válido.
  const jaExiste = await prisma.solicitacao.findFirst({
    where: {
      usuarioId: funcionario.id,
      dia: dados.dia,
      status: { in: ["PENDENTE", "AGUARDANDO_FUNCIONARIO"] },
    },
    select: { id: true },
  });
  if (jaExiste) {
    return NextResponse.json(
      { erro: "Já existe um pedido em análise para esse dia." },
      { status: 409 },
    );
  }

  const solicitacao = await prisma.solicitacao.create({
    data: {
      usuarioId: funcionario.id,
      acao: "INCLUIR",
      dia: dados.dia,
      tipo: dados.tipo,
      horario: dados.horario,
      motivo: dados.motivo,
    },
    select: { id: true },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: funcionario.id,
      acao: "AJUSTE_SOLICITADO_NO_TOTEM",
      detalhe: `${dados.dia} ${dados.tipo} ${dados.horario}`,
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true, solicitacao });
}
