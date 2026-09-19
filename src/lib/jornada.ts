import type { Registro, TipoRegistro } from "@prisma/client";
import { diaSemanaNumero, horaDe, horaParaMinutos, minutosDoDia } from "./datas";
import { escalaDoDia, type EscalaDoDia, type HorarioSimples, type PadraoJornada } from "./escala";
import type { AusenciaSimples } from "./ausencia";

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

/** Por que um dia ficou devendo explicacao. */
export type Pendencia = "SEM_REGISTRO" | "INCOMPLETO";

export const ROTULO_PENDENCIA: Record<Pendencia, string> = {
  SEM_REGISTRO: "sem nenhuma batida",
  INCOMPLETO: "falta entrada ou saída",
};

export type JornadaDoDia = {
  dia: string;
  /** Minutos efetivamente trabalhados (pares entrada->saida). */
  trabalhado: number;
  /** Minutos de intervalo (saida p/ intervalo -> retorno). */
  intervalo: number;
  /** Minutos previstos para o dia (0 em folga, abono ou antes da admissao). */
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
  /** Dia de expediente pela escala do funcionario. */
  diaUtil: boolean;
  /** Escala aplicada ao dia (horario proprio do dia ou padrao do funcionario). */
  escala: EscalaDoDia;
  /** O dia realmente cobra jornada (util, sem abono e depois da admissao). */
  cobra: boolean;
  /** Ausencia validada que abonou o dia. */
  abono: AusenciaSimples | null;
  /** O dia e anterior a admissao do funcionario. */
  antesDaAdmissao: boolean;
  /** Dia passado que deveria ter batidas completas e nao tem. */
  pendencia: Pendencia | null;
  registros: RegistroSimples[];
};

export type ParametrosJornada = PadraoJornada & {
  /** Horarios por dia da semana. Ausente = usa so o padrao. */
  horarios?: HorarioSimples[] | null;
  /** Competencia YYYY-MM-DD da admissao; antes dela nao ha jornada devida. */
  admissaoEm?: string | null;
};

export type OpcoesJornada = {
  fuso: string;
  toleranciaMinutos: number;
  agora?: Date;
  /** Ausencia validada que cobre o dia, quando houver. */
  abono?: AusenciaSimples | null;
  /**
   * Hoje na competencia da empresa. So com ele da para dizer que um dia esta
   * pendente: o dia corrente ainda vai receber batidas e nao pode ser cobrado.
   */
  hoje?: string;
};

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
  opcoes: OpcoesJornada,
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
  const escala = escalaDoDia(usuario, usuario.horarios, diaSemanaNumero(dia));
  const diaUtil = escala.trabalha;

  // Tres motivos tiram a jornada prevista do dia, e cada um por uma razao
  // diferente: folga de escala, ausencia ja validada, ou dia anterior a
  // admissao — nesse ultimo caso a pessoa sequer trabalhava aqui.
  const abono = opcoes.abono ?? null;
  const antesDaAdmissao = !!usuario.admissaoEm && dia < usuario.admissaoEm;
  const cobra = diaUtil && !abono && !antesDaAdmissao;
  const previsto = cobra ? escala.cargaMinutos : 0;

  // Só uma ENTRADA de verdade serve de referência: em um dia com a sequência
  // quebrada (ex.: só a saída foi batida) não existe atraso a apurar.
  const primeiraEntradaReg = ordenados.find((r) => r.tipo === "ENTRADA");
  const ultimaSaidaReg = [...ordenados].reverse().find((r) => r.tipo === "SAIDA");

  let atrasoMinutos = 0;
  if (cobra && primeiraEntradaReg) {
    const previstoMin = horaParaMinutos(escala.entrada);
    const realMin = minutosDoDia(primeiraEntradaReg.momento, fuso);
    const diff = realMin - previstoMin;
    if (diff > toleranciaMinutos) atrasoMinutos = diff;
  }

  // Um dia só vira pendência depois de encerrado: o de hoje ainda vai receber
  // batidas, e cobrar a saída de quem está trabalhando agora seria falso alarme.
  let pendencia: Pendencia | null = null;
  if (cobra && opcoes.hoje && dia < opcoes.hoje) {
    if (ordenados.length === 0) pendencia = "SEM_REGISTRO";
    else if (!primeiraEntradaReg || !ultimaSaidaReg || emAndamento) pendencia = "INCOMPLETO";
  }

  const saldo = ordenados.length === 0 && previsto === 0 ? 0 : trabalhado - previsto;

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
    escala,
    cobra,
    abono,
    antesDaAdmissao,
    pendencia,
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
      /** Dias de expediente que ficaram sem nenhuma batida. */
      faltas: acc.faltas + (j.pendencia === "SEM_REGISTRO" ? 1 : 0),
      /** Dias que precisam de ajuste (sem batida ou com a sequencia furada). */
      pendentes: acc.pendentes + (j.pendencia ? 1 : 0),
      /** Dias cobertos por ferias/folga/atestado ja validados. */
      abonados: acc.abonados + (j.abono ? 1 : 0),
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
      faltas: 0,
      pendentes: 0,
      abonados: 0,
    },
  );
}
