import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { totemDaApi } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { confiancaPercentual, descriptorValido } from "@/lib/face";
import { dentroDaCerca as avaliarCerca, distanciaMetros } from "@/lib/geo";
import { diaDe, horaDe, limitesDoDia } from "@/lib/datas";
import { ROTULO_TIPO, validarSequencia } from "@/lib/jornada";
import { identificarNoTotem, MENSAGEM_TOTEM } from "@/lib/totem";
import { agenteDaRequisicao, ipDaRequisicao } from "@/lib/requisicao";
import { limitar } from "@/lib/limite";

const corpo = z.object({
  tipo: z.enum(["ENTRADA", "INICIO_INTERVALO", "FIM_INTERVALO", "SAIDA"]),
  descriptor: z.array(z.number()).length(128),
  matricula: z.string().trim().max(20).nullable().optional(),
  foto: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  precisaoMetros: z.number().nullable().optional(),
});

const MAX_FOTO = 400_000;

/**
 * Registra o ponto de quem está na frente da câmera do totem.
 *
 * O rosto é identificado de novo aqui, a partir do vetor recebido — o totem
 * não manda "quem" é a pessoa. Assim, mesmo que alguém adultere a tela, o
 * ponto cai sempre no dono do rosto que o servidor reconheceu.
 */
export async function POST(req: Request) {
  const totem = await totemDaApi();
  if (!totem) return NextResponse.json({ erro: "Sessão do totem expirada." }, { status: 401 });

  const { permitido } = limitar(`totem:registrar:${totem.id}`, 60, 60);
  if (!permitido) {
    return NextResponse.json({ erro: "Muitos registros seguidos. Aguarde." }, { status: 429 });
  }

  const parse = corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success || !descriptorValido(parse.data.descriptor)) {
    return NextResponse.json({ erro: "Dados do registro inválidos." }, { status: 400 });
  }
  const dados = parse.data;
  const config = await obterConfig();

  // ---- 1. De quem é este rosto? ----
  const resultado = await identificarNoTotem(dados.descriptor, config, dados.matricula ?? null);
  if (resultado.situacao !== "IDENTIFICADO") {
    return NextResponse.json(
      { erro: MENSAGEM_TOTEM[resultado.situacao], situacao: resultado.situacao },
      { status: 401 },
    );
  }
  const { funcionario, distancia } = resultado;

  // ---- 2. Consentimento de uso de imagem (LGPD) ----
  if (funcionario.termoAceiteEm === null) {
    return NextResponse.json(
      {
        erro: "É preciso aceitar o termo de uso de imagem antes do primeiro registro.",
        situacao: "TERMO_PENDENTE",
      },
      { status: 428 },
    );
  }

  // ---- 3. Localização ----
  // O totem é um aparelho fixo, sob controle da empresa: a garantia de lugar
  // vem do próprio equipamento, não do GPS (que num tablet em ambiente fechado
  // erra muito). Registramos a posição quando o aparelho informa, sem bloquear.
  let distanciaDaEmpresa: number | null = null;
  let dentroDaCerca: boolean | null = null;
  if (
    config.geofenceAtiva &&
    config.latitude != null &&
    config.longitude != null &&
    dados.latitude != null &&
    dados.longitude != null
  ) {
    distanciaDaEmpresa = distanciaMetros(
      dados.latitude,
      dados.longitude,
      config.latitude,
      config.longitude,
    );
    dentroDaCerca = avaliarCerca(distanciaDaEmpresa, config.raioMetros, dados.precisaoMetros);
  }

  // ---- 4. Sequência e repetição ----
  const agora = new Date();
  const dia = diaDe(agora, config.fusoHorario);
  const { inicio, fim } = limitesDoDia(dia, config.fusoHorario);

  const doDia = await prisma.registro.findMany({
    where: { usuarioId: funcionario.id, momento: { gte: inicio, lt: fim } },
    orderBy: { momento: "asc" },
    select: { tipo: true, momento: true },
  });

  const ultimo = doDia[doDia.length - 1] ?? null;
  if (ultimo) {
    const minutos = (agora.getTime() - ultimo.momento.getTime()) / 60000;
    if (minutos < config.intervaloMinimoMinutos) {
      return NextResponse.json(
        {
          erro: `${funcionario.nome.split(" ")[0]}, você registrou "${ROTULO_TIPO[ultimo.tipo]}" há instantes. Aguarde ${config.intervaloMinimoMinutos} minuto(s).`,
        },
        { status: 429 },
      );
    }
  }

  const problema = validarSequencia(ultimo?.tipo ?? null, dados.tipo);
  if (problema) return NextResponse.json({ erro: problema }, { status: 409 });

  // ---- 5. Grava ----
  const foto = config.salvarFoto && dados.foto && dados.foto.length <= MAX_FOTO ? dados.foto : null;

  const registro = await prisma.registro.create({
    data: {
      usuarioId: funcionario.id,
      tipo: dados.tipo,
      momento: agora,
      dia,
      origem: "TOTEM",
      faceDistancia: distancia,
      fotoBase64: foto,
      latitude: dados.latitude ?? null,
      longitude: dados.longitude ?? null,
      precisaoMetros: dados.precisaoMetros ?? null,
      distanciaMetros: distanciaDaEmpresa,
      dentroDaCerca,
      observacao: dados.matricula ? "Identificado por matrícula + rosto no totem" : null,
      ip: ipDaRequisicao(req),
      userAgent: agenteDaRequisicao(req),
    },
  });

  return NextResponse.json({
    ok: true,
    funcionario: {
      nome: funcionario.nome,
      primeiroNome: funcionario.nome.split(" ")[0],
      matricula: funcionario.matricula,
    },
    registro: {
      tipo: registro.tipo,
      rotulo: ROTULO_TIPO[registro.tipo],
      hora: horaDe(registro.momento, config.fusoHorario),
    },
    confianca: confiancaPercentual(distancia),
    aviso:
      dentroDaCerca === false
        ? `Registrado a ${distanciaDaEmpresa} m do local cadastrado da empresa.`
        : null,
  });
}
