/**
 * Ausencias combinadas (ferias, folga, atestado) e o efeito delas na jornada.
 *
 * O ponto delicado: uma ausencia so abona depois de VALIDADA. Agendar sozinho
 * nao apaga a cobranca de horas — senao bastaria lancar um periodo qualquer
 * para zerar um debito, sem ninguem conferir.
 */

export type TipoAusenciaSimples = "FERIAS" | "FOLGA" | "ATESTADO" | "LICENCA" | "OUTRO";

export type AusenciaSimples = {
  id?: string;
  tipo: TipoAusenciaSimples;
  /** Competencias YYYY-MM-DD, inclusive nas duas pontas. */
  inicio: string;
  fim: string;
  status: "AGENDADA" | "VALIDADA" | "CANCELADA";
};

export const ROTULO_AUSENCIA: Record<TipoAusenciaSimples, string> = {
  FERIAS: "Férias",
  FOLGA: "Folga",
  ATESTADO: "Atestado",
  LICENCA: "Licença",
  OUTRO: "Ausência",
};

export const ROTULO_STATUS_AUSENCIA = {
  AGENDADA: "Agendada",
  VALIDADA: "Validada",
  CANCELADA: "Cancelada",
} as const;

/** O dia cai dentro do periodo? Datas YYYY-MM-DD comparam bem como texto. */
export function cobreODia(ausencia: AusenciaSimples, dia: string): boolean {
  return ausencia.inicio <= dia && dia <= ausencia.fim;
}

/**
 * A ausencia validada que abona o dia, ou null.
 *
 * Havendo mais de uma, vale a primeira encontrada: sobreposicao e barrada no
 * cadastro, entao aqui basta nao quebrar.
 */
export function abonoDoDia(
  ausencias: AusenciaSimples[] | null | undefined,
  dia: string,
): AusenciaSimples | null {
  if (!ausencias?.length) return null;
  return ausencias.find((a) => a.status === "VALIDADA" && cobreODia(a, dia)) ?? null;
}

/** Periodos que se cruzam, para impedir duas ferias no mesmo dia. */
export function conflita(a: { inicio: string; fim: string }, b: { inicio: string; fim: string }) {
  return a.inicio <= b.fim && b.inicio <= a.fim;
}

/** Quantidade de dias corridos do periodo (inclusive nas duas pontas). */
export function diasCorridos(inicio: string, fim: string): number {
  const ms = Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`);
  return Math.floor(ms / 86_400_000) + 1;
}
