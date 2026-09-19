import "server-only";
import { prisma } from "./prisma";
import { obterConfig } from "./config";
import { hojeStr, intervaloDeDias, limitesDoDia } from "./datas";
import { calcularJornada, situacaoAtual, totalizar, type JornadaDoDia } from "./jornada";
import { abonoDoDia, type AusenciaSimples } from "./ausencia";

/** Campos de jornada necessários para o cálculo. */
const SELECAO_USUARIO = {
  id: true,
  nome: true,
  matricula: true,
  cargo: true,
  departamento: true,
  ativo: true,
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

/** Ausências que abonam um período — só as validadas pesam no cálculo. */
export async function ausenciasDoPeriodo(
  usuarioIds: string[],
  de: string,
  ate: string,
): Promise<Map<string, AusenciaSimples[]>> {
  if (usuarioIds.length === 0) return new Map();
  const linhas = await prisma.ausencia.findMany({
    // Dois períodos se cruzam quando cada um começa antes do fim do outro.
    where: { usuarioId: { in: usuarioIds }, inicio: { lte: ate }, fim: { gte: de } },
    select: { id: true, usuarioId: true, tipo: true, inicio: true, fim: true, status: true },
    orderBy: { inicio: "asc" },
  });
  const porUsuario = new Map<string, AusenciaSimples[]>();
  for (const a of linhas) {
    const lista = porUsuario.get(a.usuarioId) ?? [];
    lista.push(a);
    porUsuario.set(a.usuarioId, lista);
  }
  return porUsuario;
}

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

  const ausencias = await ausenciasDoPeriodo(
    funcionarios.map((f) => f.id),
    dia,
    dia,
  );

  const porUsuario = new Map<string, typeof registros>();
  for (const r of registros) {
    const lista = porUsuario.get(r.usuarioId) ?? [];
    lista.push(r);
    porUsuario.set(r.usuarioId, lista);
  }
  const comBiometria = new Set(biometrias.map((b) => b.usuarioId));
  const hoje = hojeStr(config.fusoHorario);

  const linhas = funcionarios.map((f) => {
    const meus = porUsuario.get(f.id) ?? [];
    const jornada = calcularJornada(dia, meus, f, {
      fuso: config.fusoHorario,
      toleranciaMinutos: config.toleranciaMinutos,
      abono: abonoDoDia(ausencias.get(f.id), dia),
      hoje,
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

  const ausencias = (await ausenciasDoPeriodo([usuarioId], de, ate)).get(usuarioId) ?? [];

  const jornadas: (JornadaDoDia & { detalhes: typeof registros })[] = intervaloDeDias(de, ate).map(
    (dia) => {
      const doDia = porDia.get(dia) ?? [];
      return {
        ...calcularJornada(dia, doDia, usuario, {
          fuso: config.fusoHorario,
          toleranciaMinutos: config.toleranciaMinutos,
          abono: abonoDoDia(ausencias, dia),
          hoje,
        }),
        detalhes: doDia,
      };
    },
  );

  return { config, usuario, jornadas, de, ate, ausencias };
}

/**
 * Saldo de horas de cada funcionário no período — base do painel de monitoria.
 *
 * Faz uma consulta só de registros para todo mundo, em vez de um espelho por
 * pessoa: com a equipe crescendo, o painel não pode virar uma consulta por
 * funcionário.
 */
export async function saldosDoPeriodo(de: string, ateSolicitado: string, incluirInativos = false) {
  const config = await obterConfig();
  const hoje = hojeStr(config.fusoHorario);
  const ate = ateSolicitado > hoje ? hoje : ateSolicitado;

  const funcionarios = await prisma.usuario.findMany({
    where: { papel: "FUNCIONARIO", ...(incluirInativos ? {} : { ativo: true }) },
    select: SELECAO_USUARIO,
    orderBy: { nome: "asc" },
  });

  if (funcionarios.length === 0 || ate < de) {
    return { config, de, ate, linhas: [] };
  }

  const ids = funcionarios.map((f) => f.id);
  const inicio = limitesDoDia(de, config.fusoHorario).inicio;
  const fim = limitesDoDia(ate, config.fusoHorario).fim;

  const [registros, ausencias, pendentesAbertas] = await Promise.all([
    prisma.registro.findMany({
      where: { usuarioId: { in: ids }, momento: { gte: inicio, lt: fim } },
      orderBy: { momento: "asc" },
      select: { usuarioId: true, tipo: true, momento: true, dia: true },
    }),
    ausenciasDoPeriodo(ids, de, ate),
    prisma.solicitacao.groupBy({
      by: ["usuarioId"],
      where: { usuarioId: { in: ids }, status: { in: ["PENDENTE", "AGUARDANDO_FUNCIONARIO"] } },
      _count: { _all: true },
    }),
  ]);

  const porUsuarioDia = new Map<string, typeof registros>();
  for (const r of registros) {
    const chave = `${r.usuarioId}|${r.dia}`;
    const lista = porUsuarioDia.get(chave) ?? [];
    lista.push(r);
    porUsuarioDia.set(chave, lista);
  }
  const ajustesAbertos = new Map(pendentesAbertas.map((p) => [p.usuarioId, p._count._all]));
  const dias = intervaloDeDias(de, ate);

  const linhas = funcionarios.map((f) => {
    const jornadas = dias.map((dia) =>
      calcularJornada(dia, porUsuarioDia.get(`${f.id}|${dia}`) ?? [], f, {
        fuso: config.fusoHorario,
        toleranciaMinutos: config.toleranciaMinutos,
        abono: abonoDoDia(ausencias.get(f.id), dia),
        hoje,
      }),
    );
    return {
      funcionario: f,
      total: totalizar(jornadas),
      ajustesAbertos: ajustesAbertos.get(f.id) ?? 0,
    };
  });

  return { config, de, ate, linhas };
}

export type LinhaSaldo = Awaited<ReturnType<typeof saldosDoPeriodo>>["linhas"][number];
