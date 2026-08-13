import "server-only";
import { prisma } from "./prisma";
import { obterConfig } from "./config";
import { hojeStr, intervaloDeDias, limitesDoDia } from "./datas";
import { calcularJornada, situacaoAtual, type JornadaDoDia } from "./jornada";

/** Campos de jornada necessários para o cálculo. */
const SELECAO_USUARIO = {
  id: true,
  nome: true,
  matricula: true,
  cargo: true,
  departamento: true,
  ativo: true,
  cargaDiariaMinutos: true,
  entradaPrevista: true,
  saidaPrevista: true,
  intervaloMinutos: true,
  diasSemana: true,
} as const;

/**
 * Situação de todos os funcionários ativos em um dia — base do painel do admin.
 */
export async function panoramaDoDia(dia: string) {
  const config = await obterConfig();
  const { inicio, fim } = limitesDoDia(dia, config.fusoHorario);

  const [funcionarios, registros, biometrias] = await Promise.all([
    prisma.usuario.findMany({
      where: { ativo: true, papel: "FUNCIONARIO" },
      select: SELECAO_USUARIO,
      orderBy: { nome: "asc" },
    }),
    prisma.registro.findMany({
      where: { momento: { gte: inicio, lt: fim } },
      orderBy: { momento: "asc" },
      select: {
        id: true,
        usuarioId: true,
        tipo: true,
        momento: true,
        origem: true,
        dentroDaCerca: true,
        distanciaMetros: true,
      },
    }),
    prisma.biometria.groupBy({ by: ["usuarioId"], _count: { _all: true } }),
  ]);

  const porUsuario = new Map<string, typeof registros>();
  for (const r of registros) {
    const lista = porUsuario.get(r.usuarioId) ?? [];
    lista.push(r);
    porUsuario.set(r.usuarioId, lista);
  }
  const comBiometria = new Set(biometrias.map((b) => b.usuarioId));

  const linhas = funcionarios.map((f) => {
    const meus = porUsuario.get(f.id) ?? [];
    const jornada = calcularJornada(dia, meus, f, {
      fuso: config.fusoHorario,
      toleranciaMinutos: config.toleranciaMinutos,
    });
    return {
      funcionario: f,
      jornada,
      registros: meus,
      situacao: situacaoAtual(meus),
      temBiometria: comBiometria.has(f.id),
      foraDaCerca: meus.some((r) => r.dentroDaCerca === false),
    };
  });

  return { config, linhas };
}

/**
 * Espelho de ponto de um funcionário em um período (usado em relatórios e CSV).
 */
export async function espelhoDePonto(usuarioId: string, de: string, ateSolicitado: string) {
  const config = await obterConfig();
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: SELECAO_USUARIO,
  });
  if (!usuario) return null;

  // Dias que ainda não aconteceram não geram jornada prevista — sem esse corte,
  // pedir o mês inteiro no dia 10 mostraria o resto do mês como débito.
  const hoje = hojeStr(config.fusoHorario);
  const ate = ateSolicitado > hoje ? hoje : ateSolicitado;
  if (ate < de) {
    return { config, usuario, jornadas: [], de, ate: ateSolicitado };
  }

  const inicio = limitesDoDia(de, config.fusoHorario).inicio;
  const fim = limitesDoDia(ate, config.fusoHorario).fim;

  const registros = await prisma.registro.findMany({
    where: { usuarioId, momento: { gte: inicio, lt: fim } },
    orderBy: { momento: "asc" },
    select: {
      id: true,
      tipo: true,
      momento: true,
      dia: true,
      origem: true,
      observacao: true,
      dentroDaCerca: true,
      distanciaMetros: true,
    },
  });

  const porDia = new Map<string, typeof registros>();
  for (const r of registros) {
    const lista = porDia.get(r.dia) ?? [];
    lista.push(r);
    porDia.set(r.dia, lista);
  }

  const jornadas: (JornadaDoDia & { detalhes: typeof registros })[] = intervaloDeDias(de, ate).map(
    (dia) => {
      const doDia = porDia.get(dia) ?? [];
      return {
        ...calcularJornada(dia, doDia, usuario, {
          fuso: config.fusoHorario,
          toleranciaMinutos: config.toleranciaMinutos,
        }),
        detalhes: doDia,
      };
    },
  );

  return { config, usuario, jornadas, de, ate };
}
