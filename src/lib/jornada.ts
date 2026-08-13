import type { Registro, TipoRegistro, Usuario } from "@prisma/client";
import { diaSemanaNumero, horaDe, horaParaMinutos, minutosDoDia } from "./datas";

export const ROTULO_TIPO: Record<TipoRegistro, string> = {
  ENTRADA: "Entrada",
  INICIO_INTERVALO: "Saída p/ intervalo",
  FIM_INTERVALO: "Retorno do intervalo",
  SAIDA: "Saída",
};

/** Tipos que "abrem" tempo de trabalho e tipos que "fecham". */
const ABRE: TipoRegistro[] = ["ENTRADA", "FIM_INTERVALO"];
const FECHA: TipoRegistro[] = ["INICIO_INTERVALO", "SAIDA"];

export type RegistroSimples = Pick<Registro, "tipo" | "momento">;

export type JornadaDoDia = {
  dia: string;
  /** Minutos efetivamente trabalhados (pares entrada->saida). */
  trabalhado: number;
  /** Minutos de intervalo (saida p/ intervalo -> retorno). */
  intervalo: number;
  /** Minutos previstos para o dia (0 em folga). */
  previsto: number;
  /** trabalhado - previsto (positivo = extra, negativo = deve). */
  saldo: number;
  extras: number;
  devendo: number;
  atrasoMinutos: number;
  primeiraEntrada: string | null;
  ultimaSaida: string | null;
  /** Ainda existe um par em aberto (funcionario dentro do expediente). */
  emAndamento: boolean;
  /** Sequencia de batidas inconsistente (ex.: duas entradas seguidas). */
  inconsistente: boolean;
  /** Dia util para este funcionario. */
  diaUtil: boolean;
  registros: RegistroSimples[];
};

export type ParametrosJornada = Pick<
  Usuario,
  "cargaDiariaMinutos" | "entradaPrevista" | "diasSemana"
>;

/**
 * Calcula a jornada de um dia a partir das batidas.
 *
 * O calculo e tolerante: batidas fora de ordem sao ordenadas por horario e
 * pares incompletos (esqueceu de bater a saida) apenas marcam `emAndamento`
 * em vez de gerar tempo trabalhado fantasma.
 */
export function calcularJornada(
  dia: string,
  registros: RegistroSimples[],
  usuario: ParametrosJornada,
  opcoes: { fuso: string; toleranciaMinutos: number; agora?: Date },
): JornadaDoDia {
  const { fuso, toleranciaMinutos } = opcoes;
  const ordenados = [...registros].sort((a, b) => a.momento.getTime() - b.momento.getTime());

  let trabalhado = 0;
  let intervalo = 0;
  let inconsistente = false;
  let abertoEm: Date | null = null;
  let intervaloAbertoEm: Date | null = null;

  for (const r of ordenados) {
    if (ABRE.includes(r.tipo)) {
      if (abertoEm) inconsistente = true;
      else abertoEm = r.momento;
      if (r.tipo === "FIM_INTERVALO" && intervaloAbertoEm) {
        intervalo += minutosEntre(intervaloAbertoEm, r.momento);
        intervaloAbertoEm = null;
      }
    } else if (FECHA.includes(r.tipo)) {
      if (abertoEm) {
        trabalhado += minutosEntre(abertoEm, r.momento);
        abertoEm = null;
      } else {
        inconsistente = true;
      }
      if (r.tipo === "INICIO_INTERVALO") intervaloAbertoEm = r.momento;
    }
  }

  const emAndamento = abertoEm !== null;
  const diaUtil = usuario.diasSemana.includes(diaSemanaNumero(dia));
  const previsto = diaUtil ? usuario.cargaDiariaMinutos : 0;

  // Só uma ENTRADA de verdade serve de referência: em um dia com a sequência
  // quebrada (ex.: só a saída foi batida) não existe atraso a apurar.
  const primeiraEntradaReg = ordenados.find((r) => r.tipo === "ENTRADA");
  const ultimaSaidaReg = [...ordenados].reverse().find((r) => r.tipo === "SAIDA");

  let atrasoMinutos = 0;
  if (diaUtil && primeiraEntradaReg) {
    const previstoMin = horaParaMinutos(usuario.entradaPrevista);
    const realMin = minutosDoDia(primeiraEntradaReg.momento, fuso);
    const diff = realMin - previstoMin;
    if (diff > toleranciaMinutos) atrasoMinutos = diff;
  }

  const saldo = ordenados.length === 0 && !diaUtil ? 0 : trabalhado - previsto;

  return {
    dia,
    trabalhado,
    intervalo,
    previsto,
    saldo,
    extras: Math.max(0, saldo),
    devendo: Math.max(0, -saldo),
    atrasoMinutos,
    primeiraEntrada: primeiraEntradaReg ? horaDe(primeiraEntradaReg.momento, fuso) : null,
    ultimaSaida: ultimaSaidaReg ? horaDe(ultimaSaidaReg.momento, fuso) : null,
    emAndamento,
    inconsistente,
    diaUtil,
    registros: ordenados,
  };
}

function minutosEntre(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 60000);
}

/**
 * Proxima batida esperada, usada para pre-selecionar o botao na tela de ponto.
 */
export function proximoTipo(registros: RegistroSimples[]): TipoRegistro {
  const ordenados = [...registros].sort((a, b) => a.momento.getTime() - b.momento.getTime());
  const ultimo = ordenados[ordenados.length - 1];
  if (!ultimo) return "ENTRADA";
  switch (ultimo.tipo) {
    case "ENTRADA":
      return "INICIO_INTERVALO";
    case "INICIO_INTERVALO":
      return "FIM_INTERVALO";
    case "FIM_INTERVALO":
      return "SAIDA";
    case "SAIDA":
      return "ENTRADA";
  }
}

/**
 * Valida se a batida faz sentido depois da anterior.
 * Devolve `null` quando esta ok ou a mensagem de impedimento.
 */
export function validarSequencia(
  ultimo: TipoRegistro | null,
  novo: TipoRegistro,
): string | null {
  const trabalhando = ultimo === "ENTRADA" || ultimo === "FIM_INTERVALO";
  const emIntervalo = ultimo === "INICIO_INTERVALO";

  switch (novo) {
    case "ENTRADA":
      if (trabalhando) return "Você já registrou a entrada. Registre a saída antes de entrar de novo.";
      if (emIntervalo) return "Você está em intervalo. Use “Retorno do intervalo”.";
      return null;
    case "INICIO_INTERVALO":
      if (!trabalhando) return "Registre a entrada antes de sair para o intervalo.";
      return null;
    case "FIM_INTERVALO":
      if (!emIntervalo) return "Não há intervalo em aberto para encerrar.";
      return null;
    case "SAIDA":
      if (emIntervalo) return "Registre o retorno do intervalo antes da saída.";
      if (!trabalhando) return "Registre a entrada antes de registrar a saída.";
      return null;
  }
}

/** Situacao atual do funcionario, para o painel do admin. */
export function situacaoAtual(registros: RegistroSimples[]): "TRABALHANDO" | "INTERVALO" | "FORA" {
  const ordenados = [...registros].sort((a, b) => a.momento.getTime() - b.momento.getTime());
  const ultimo = ordenados[ordenados.length - 1];
  if (!ultimo) return "FORA";
  if (ultimo.tipo === "ENTRADA" || ultimo.tipo === "FIM_INTERVALO") return "TRABALHANDO";
  if (ultimo.tipo === "INICIO_INTERVALO") return "INTERVALO";
  return "FORA";
}

/** Soma um conjunto de jornadas para o rodape do espelho de ponto. */
export function totalizar(jornadas: JornadaDoDia[]) {
  return jornadas.reduce(
    (acc, j) => ({
      trabalhado: acc.trabalhado + j.trabalhado,
      previsto: acc.previsto + j.previsto,
      intervalo: acc.intervalo + j.intervalo,
      extras: acc.extras + j.extras,
      devendo: acc.devendo + j.devendo,
      saldo: acc.saldo + j.saldo,
      atrasos: acc.atrasos + (j.atrasoMinutos > 0 ? 1 : 0),
      diasTrabalhados: acc.diasTrabalhados + (j.registros.length > 0 ? 1 : 0),
    }),
    {
      trabalhado: 0,
      previsto: 0,
      intervalo: 0,
      extras: 0,
      devendo: 0,
      saldo: 0,
      atrasos: 0,
      diasTrabalhados: 0,
    },
  );
}
