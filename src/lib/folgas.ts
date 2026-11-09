import { diaSemanaNumero, somaDias } from "./datas";

/**
 * Folgas marcadas semana a semana no painel de folgas.
 *
 * Funções puras: quem consulta o banco é `folgasSalvas.ts`. Ficam aqui para
 * que o cálculo de jornada, a tela e os testes usem exatamente a mesma regra.
 */

/** Ordem das colunas do painel: a semana da loja começa na segunda. */
export const DIAS_DO_PAINEL = [1, 2, 3, 4, 5, 6, 0] as const;

export type SemanaMarcada = {
  /** Segunda-feira da semana, YYYY-MM-DD. */
  semana: string;
  /** 0=domingo ... 6=sábado. */
  dias: number[];
};

/** Segunda-feira da semana a que o dia pertence. */
export function segundaDaSemana(dia: string): string {
  const desdeSegunda = (diaSemanaNumero(dia) + 6) % 7;
  return somaDias(dia, -desdeSegunda);
}

/** Os sete dias da semana, de segunda a domingo. */
export function diasDaSemana(segunda: string): string[] {
  return Array.from({ length: 7 }, (_, i) => somaDias(segunda, i));
}

export type FolgasDaSemana = {
  dias: number[];
  /**
   * Semana de onde as folgas vieram, quando a semana pedida não foi marcada e
   * repete uma anterior. Nulo quando a própria semana foi marcada.
   */
  repeteDe: string | null;
};

/**
 * Folgas em vigor numa semana: as marcadas nela ou, sem marcação, as da
 * última semana marcada antes dela.
 *
 * Cópia automática por herança, e não por gravação: uma semana que ninguém
 * abriu no painel ainda assim tem escala, e o cálculo de horas não depende de
 * alguém ter passado pela tela. Antes da primeira marcação não há folga
 * nenhuma — vale só o horário normal do funcionário.
 */
export function folgasDaSemana(marcadas: SemanaMarcada[], semana: string): FolgasDaSemana | null {
  let melhor: SemanaMarcada | null = null;
  for (const m of marcadas) {
    if (m.semana > semana) continue;
    if (!melhor || m.semana > melhor.semana) melhor = m;
  }
  if (!melhor) return null;
  return { dias: melhor.dias, repeteDe: melhor.semana === semana ? null : melhor.semana };
}

/** O dia cai numa folga marcada (ou herdada) no painel? */
export function folgaNoDia(marcadas: SemanaMarcada[] | undefined, dia: string): boolean {
  if (!marcadas || marcadas.length === 0) return false;
  const vigor = folgasDaSemana(marcadas, segundaDaSemana(dia));
  return !!vigor && vigor.dias.includes(diaSemanaNumero(dia));
}
