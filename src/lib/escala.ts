/**
 * Resolve qual e a jornada de um dia da semana.
 *
 * Existe porque uma loja raramente trabalha a semana inteira no mesmo horario:
 * sabado costuma abrir mais tarde ou fechar mais cedo. Antes disso o cadastro
 * tinha um unico par entrada/saida para os sete dias.
 *
 * A regra e deliberadamente tolerante com o cadastro antigo: quem nao tem linha
 * de HorarioDia para o dia continua caindo no padrao do Usuario, exatamente
 * como antes. Assim a mudanca de schema nao exige mexer em quem ja esta
 * cadastrado nem inventar horarios que ninguem conferiu.
 */

/** Uma linha de HorarioDia, sem as colunas de banco. */
export type HorarioSimples = {
  diaSemana: number;
  trabalha: boolean;
  entrada: string;
  saida: string;
  intervaloMinutos: number;
  cargaMinutos: number;
};

/** Os campos de jornada que vivem no proprio Usuario (o padrao da semana). */
export type PadraoJornada = {
  cargaDiariaMinutos: number;
  entradaPrevista: string;
  saidaPrevista: string;
  intervaloMinutos: number;
  diasSemana: number[];
};

export type EscalaDoDia = {
  diaSemana: number;
  /** Falso em folga: o dia nao cobra jornada. */
  trabalha: boolean;
  entrada: string;
  saida: string;
  intervaloMinutos: number;
  /** Minutos previstos de trabalho no dia. */
  cargaMinutos: number;
  /** Veio de um horario proprio do dia, e nao do padrao do funcionario. */
  proprio: boolean;
};

export const NOMES_DIA_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

/** Minutos desde a meia-noite de um "HH:mm". */
function emMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * Carga que o relogio sugere: saida - entrada - intervalo.
 *
 * Turno que atravessa a meia-noite (entra 22:00, sai 06:00) conta as horas do
 * outro lado do dia em vez de devolver negativo.
 */
export function cargaSugerida(entrada: string, saida: string, intervaloMinutos: number): number {
  const ini = emMinutos(entrada);
  const fim = emMinutos(saida);
  const bruto = fim >= ini ? fim - ini : fim + 24 * 60 - ini;
  return Math.max(0, bruto - Math.max(0, intervaloMinutos));
}

/**
 * Escala de um dia da semana: usa o horario proprio quando existe e cai no
 * padrao do funcionario quando nao existe.
 */
export function escalaDoDia(
  padrao: PadraoJornada,
  horarios: HorarioSimples[] | null | undefined,
  diaSemana: number,
): EscalaDoDia {
  const proprio = horarios?.find((h) => h.diaSemana === diaSemana);
  if (proprio) {
    return {
      diaSemana,
      trabalha: proprio.trabalha,
      entrada: proprio.entrada,
      saida: proprio.saida,
      intervaloMinutos: proprio.intervaloMinutos,
      cargaMinutos: proprio.trabalha ? proprio.cargaMinutos : 0,
      proprio: true,
    };
  }

  const trabalha = padrao.diasSemana.includes(diaSemana);
  return {
    diaSemana,
    trabalha,
    entrada: padrao.entradaPrevista,
    saida: padrao.saidaPrevista,
    intervaloMinutos: padrao.intervaloMinutos,
    cargaMinutos: trabalha ? padrao.cargaDiariaMinutos : 0,
    proprio: false,
  };
}

/** A semana inteira resolvida, para montar a tabela de edicao. */
export function escalaDaSemana(
  padrao: PadraoJornada,
  horarios: HorarioSimples[] | null | undefined,
): EscalaDoDia[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => escalaDoDia(padrao, horarios, d));
}

/** Minutos previstos na semana, para conferir a jornada contratada. */
export function cargaSemanal(escalas: EscalaDoDia[]): number {
  return escalas.reduce((total, e) => total + (e.trabalha ? e.cargaMinutos : 0), 0);
}
