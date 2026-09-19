import "server-only";
import { prisma } from "./prisma";
import { obterConfig } from "./config";
import { hojeStr, intervaloDeDias, limitesDoDia, somaDias } from "./datas";
import { calcularJornada, type Pendencia } from "./jornada";
import { abonoDoDia } from "./ausencia";
import type { EscalaDoDia } from "./escala";

/** Quantos dias para tras o alerta olha, quando nao for pedido outro limite. */
export const JANELA_PENDENCIAS_DIAS = 45;

export type DiaPendente = {
  dia: string;
  motivo: Pendencia;
  escala: EscalaDoDia;
  /** Batidas que existem no dia (pode ser vazio). */
  batidas: { id: string; tipo: string; hora: string }[];
  /** Ja existe uma solicitacao em aberto para este dia. */
  jaSolicitado: boolean;
};

const SELECAO = {
  id: true,
  nome: true,
  admissaoEm: true,
  cargaDiariaMinutos: true,
  entradaPrevista: true,
  saidaPrevista: true,
  intervaloMinutos: true,
  diasSemana: true,
  horarios: {
    select: {
      diaSemana: true,
      trabalha: true,
      entrada: true,
      saida: true,
      intervaloMinutos: true,
      cargaMinutos: true,
    },
  },
} as const;

/**
 * Dias passados em que o funcionario deveria ter batido e nao bateu, mais os
 * ajustes que o administrador propos e esperam o de-acordo dele.
 *
 * A janela e curta de proposito: cobrar uma batida de seis meses atras no meio
 * do expediente atrapalha mais do que ajuda, e o espelho de ponto continua
 * mostrando o historico inteiro.
 */
export async function pendenciasDoFuncionario(usuarioId: string, janelaDias = JANELA_PENDENCIAS_DIAS) {
  const config = await obterConfig();
  const hoje = hojeStr(config.fusoHorario);
  // O dia de hoje fica de fora: ainda vai receber batidas.
  const ate = somaDias(hoje, -1);
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: SELECAO });
  if (!usuario) return { dias: [] as DiaPendente[], propostas: [] as PropostaDeAjuste[] };

  let de = somaDias(hoje, -janelaDias);
  if (usuario.admissaoEm && usuario.admissaoEm > de) de = usuario.admissaoEm;
  if (de > ate) return { dias: [], propostas: await propostasAbertas(usuarioId, config.fusoHorario) };

  const inicio = limitesDoDia(de, config.fusoHorario).inicio;
  const fim = limitesDoDia(ate, config.fusoHorario).fim;

  const [registros, ausencias, solicitacoes] = await Promise.all([
    prisma.registro.findMany({
      where: { usuarioId, momento: { gte: inicio, lt: fim } },
      orderBy: { momento: "asc" },
      select: { id: true, tipo: true, momento: true, dia: true },
    }),
    prisma.ausencia.findMany({
      where: { usuarioId, inicio: { lte: ate }, fim: { gte: de } },
      select: { id: true, tipo: true, inicio: true, fim: true, status: true },
    }),
    // Dias que ja tem conversa em aberto nao entram no alerta de novo.
    prisma.solicitacao.findMany({
      where: {
        usuarioId,
        dia: { gte: de, lte: ate },
        status: { in: ["PENDENTE", "AGUARDANDO_FUNCIONARIO", "APROVADA"] },
      },
      select: { dia: true },
    }),
  ]);

  const porDia = new Map<string, typeof registros>();
  for (const r of registros) {
    const lista = porDia.get(r.dia) ?? [];
    lista.push(r);
    porDia.set(r.dia, lista);
  }
  const comSolicitacao = new Set(solicitacoes.map((s) => s.dia));

  const dias: DiaPendente[] = [];
  for (const dia of intervaloDeDias(de, ate)) {
    const doDia = porDia.get(dia) ?? [];
    const jornada = calcularJornada(dia, doDia, usuario, {
      fuso: config.fusoHorario,
      toleranciaMinutos: config.toleranciaMinutos,
      abono: abonoDoDia(ausencias, dia),
      hoje,
    });
    if (!jornada.pendencia) continue;
    dias.push({
      dia,
      motivo: jornada.pendencia,
      escala: jornada.escala,
      batidas: doDia.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        hora: horaLocal(r.momento, config.fusoHorario),
      })),
      jaSolicitado: comSolicitacao.has(dia),
    });
  }

  return { dias, propostas: await propostasAbertas(usuarioId, config.fusoHorario) };
}

export type PropostaDeAjuste = {
  id: string;
  dia: string;
  acao: "INCLUIR" | "ALTERAR" | "EXCLUIR";
  tipo: string;
  horario: string | null;
  motivo: string;
  propostaPor: string | null;
  criadoEm: Date;
};

/** Ajustes lancados pelo administrador que aguardam o de-acordo do funcionario. */
async function propostasAbertas(usuarioId: string, _fuso: string): Promise<PropostaDeAjuste[]> {
  const linhas = await prisma.solicitacao.findMany({
    where: { usuarioId, status: "AGUARDANDO_FUNCIONARIO" },
    orderBy: { dia: "asc" },
    select: {
      id: true,
      dia: true,
      acao: true,
      tipo: true,
      horario: true,
      motivo: true,
      criadoEm: true,
      propostaPor: { select: { nome: true } },
    },
  });
  return linhas.map((l) => ({
    id: l.id,
    dia: l.dia,
    acao: l.acao,
    tipo: l.tipo,
    horario: l.horario,
    motivo: l.motivo,
    propostaPor: l.propostaPor?.nome ?? null,
    criadoEm: l.criadoEm,
  }));
}

function horaLocal(momento: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(momento);
}
