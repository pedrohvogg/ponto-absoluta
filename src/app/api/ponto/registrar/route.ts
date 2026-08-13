import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { usuarioDaApi } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { descriptorValido, melhorDistancia, confiancaPercentual } from "@/lib/face";
import { dentroDaCerca as avaliarCerca, distanciaMetros } from "@/lib/geo";
import { diaDe, horaDe, limitesDoDia } from "@/lib/datas";
import { ROTULO_TIPO, validarSequencia } from "@/lib/jornada";
import { agenteDaRequisicao, ipDaRequisicao } from "@/lib/requisicao";
import { limitar } from "@/lib/limite";

const corpo = z.object({
  tipo: z.enum(["ENTRADA", "INICIO_INTERVALO", "FIM_INTERVALO", "SAIDA"]),
  descriptor: z.array(z.number()).length(128),
  foto: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  precisaoMetros: z.number().nullable().optional(),
});

/** Limite de tamanho da miniatura aceita (data URL base64). */
const MAX_FOTO = 400_000;

export async function POST(req: Request) {
  const sessao = await usuarioDaApi();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (sessao.papel === "ADMIN") {
    return NextResponse.json(
      { erro: "Contas de administrador não registram ponto." },
      { status: 403 },
    );
  }

  const { permitido } = limitar(`ponto:${sessao.id}`, 20, 60);
  if (!permitido) {
    return NextResponse.json({ erro: "Muitas tentativas seguidas. Aguarde um momento." }, { status: 429 });
  }

  const parse = corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: "Dados do registro inválidos." }, { status: 400 });
  }
  const dados = parse.data;

  if (!descriptorValido(dados.descriptor)) {
    return NextResponse.json({ erro: "Leitura facial inválida." }, { status: 400 });
  }

  const config = await obterConfig();
  const agora = new Date();
  const dia = diaDe(agora, config.fusoHorario);

  // ---- 1. Confere o rosto contra as biometrias cadastradas ----
  const biometrias = await prisma.biometria.findMany({
    where: { usuarioId: sessao.id },
    select: { descriptor: true },
  });

  if (biometrias.length === 0) {
    return NextResponse.json(
      {
        erro: "Você ainda não cadastrou seu rosto.",
        acao: "CADASTRAR_ROSTO",
      },
      { status: 428 },
    );
  }

  const cadastradas = biometrias
    .map((b) => b.descriptor)
    .filter(descriptorValido) as unknown as number[][];

  const distancia = melhorDistancia(dados.descriptor, cadastradas);
  if (distancia === null || distancia > config.limiarFacial) {
    await prisma.auditoria.create({
      data: {
        usuarioId: sessao.id,
        acao: "FACE_RECUSADA",
        detalhe: `tipo=${dados.tipo} distancia=${distancia?.toFixed(3) ?? "n/d"} limiar=${config.limiarFacial}`,
        ip: ipDaRequisicao(req),
      },
    });
    return NextResponse.json(
      {
        erro: "Não conseguimos confirmar que é você. Melhore a iluminação, tire óculos escuros/boné e tente de novo.",
        confianca: distancia === null ? 0 : confiancaPercentual(distancia),
      },
      { status: 401 },
    );
  }

  // ---- 2. Cerca virtual ----
  let distanciaDaEmpresa: number | null = null;
  let dentroDaCerca: boolean | null = null;

  if (config.geofenceAtiva && config.latitude != null && config.longitude != null) {
    if (dados.latitude == null || dados.longitude == null) {
      return NextResponse.json(
        {
          erro:
            "Precisamos da sua localização para registrar o ponto. Autorize o acesso à localização no navegador " +
            "e verifique se o GPS do aparelho está ligado.",
          acao: "PERMITIR_LOCALIZACAO",
        },
        { status: 400 },
      );
    }
    distanciaDaEmpresa = distanciaMetros(
      dados.latitude,
      dados.longitude,
      config.latitude,
      config.longitude,
    );
    // A margem de erro do GPS entra a favor do funcionário, com teto (ver geo.ts).
    dentroDaCerca = avaliarCerca(distanciaDaEmpresa, config.raioMetros, dados.precisaoMetros);

    if (!dentroDaCerca && config.geofenceBloqueia) {
      await prisma.auditoria.create({
        data: {
          usuarioId: sessao.id,
          acao: "PONTO_FORA_DA_CERCA",
          detalhe: `distancia=${distanciaDaEmpresa}m raio=${config.raioMetros}m`,
          ip: ipDaRequisicao(req),
        },
      });
      return NextResponse.json(
        {
          erro:
            `Você está a ${distanciaDaEmpresa} m do local de trabalho (limite: ${config.raioMetros} m) e o registro só é permitido no local. ` +
            "Se você já está no trabalho, o GPS pode ter errado: saia de perto de paredes/coberturas e tente de novo. " +
            "Persistindo, avise o responsável — a tentativa já apareceu no painel dele e o ponto pode ser lançado manualmente.",
        },
        { status: 403 },
      );
    }
  }

  // ---- 3. Sequência e repetição ----
  const { inicio, fim } = limitesDoDia(dia, config.fusoHorario);
  const doDia = await prisma.registro.findMany({
    where: { usuarioId: sessao.id, momento: { gte: inicio, lt: fim } },
    orderBy: { momento: "asc" },
    select: { tipo: true, momento: true },
  });

  const ultimo = doDia[doDia.length - 1] ?? null;
  if (ultimo) {
    const minutosDesdeUltimo = (agora.getTime() - ultimo.momento.getTime()) / 60000;
    if (minutosDesdeUltimo < config.intervaloMinimoMinutos) {
      return NextResponse.json(
        {
          erro: `Você registrou "${ROTULO_TIPO[ultimo.tipo]}" há instantes. Aguarde ${config.intervaloMinimoMinutos} minuto(s) entre registros.`,
        },
        { status: 429 },
      );
    }
  }

  const problema = validarSequencia(ultimo?.tipo ?? null, dados.tipo);
  if (problema) {
    return NextResponse.json({ erro: problema }, { status: 409 });
  }

  // ---- 4. Grava ----
  const foto =
    config.salvarFoto && dados.foto && dados.foto.length <= MAX_FOTO ? dados.foto : null;

  const registro = await prisma.registro.create({
    data: {
      usuarioId: sessao.id,
      tipo: dados.tipo,
      momento: agora,
      dia,
      origem: "FACIAL",
      faceDistancia: distancia,
      fotoBase64: foto,
      latitude: dados.latitude ?? null,
      longitude: dados.longitude ?? null,
      precisaoMetros: dados.precisaoMetros ?? null,
      distanciaMetros: distanciaDaEmpresa,
      dentroDaCerca,
      ip: ipDaRequisicao(req),
      userAgent: agenteDaRequisicao(req),
    },
  });

  return NextResponse.json({
    ok: true,
    registro: {
      id: registro.id,
      tipo: registro.tipo,
      rotulo: ROTULO_TIPO[registro.tipo],
      hora: horaDe(registro.momento, config.fusoHorario),
      dia,
    },
    confianca: confiancaPercentual(distancia),
    aviso:
      dentroDaCerca === false
        ? `Registrado a ${distanciaDaEmpresa} m do local de trabalho — o administrador será informado.`
        : null,
  });
}
