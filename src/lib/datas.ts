/**
 * Helpers de data/hora cientes do fuso horario da empresa.
 *
 * Regra do projeto: `momento` sempre e gravado em UTC no banco e `dia`
 * guarda a competencia (YYYY-MM-DD) ja convertida para o fuso da empresa,
 * para que a jornada de quem trabalha perto da meia-noite nao se parta.
 */

export const FUSO_PADRAO = "America/Sao_Paulo";

function partes(data: Date, fuso: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(data).map((x) => [x.type, x.value]));
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour === "24" ? "0" : p.hour),
    minuto: Number(p.minute),
    segundo: Number(p.second),
  };
}

/** Deslocamento do fuso em minutos para um instante (ex.: -180 para BRT). */
function offsetMinutos(data: Date, fuso: string): number {
  const p = partes(data, fuso);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return (comoUtc - Math.floor(data.getTime() / 1000) * 1000) / 60000;
}

/** Competencia YYYY-MM-DD do instante, no fuso informado. */
export function diaDe(data: Date, fuso: string = FUSO_PADRAO): string {
  const p = partes(data, fuso);
  return `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

/** Hora HH:mm do instante, no fuso informado. */
export function horaDe(data: Date, fuso: string = FUSO_PADRAO): string {
  const p = partes(data, fuso);
  return `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
}

/** Hora HH:mm:ss do instante, no fuso informado. */
export function horaCompletaDe(data: Date, fuso: string = FUSO_PADRAO): string {
  const p = partes(data, fuso);
  return `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}:${String(
    p.segundo,
  ).padStart(2, "0")}`;
}

/** Minutos desde a meia-noite local do instante. */
export function minutosDoDia(data: Date, fuso: string = FUSO_PADRAO): number {
  const p = partes(data, fuso);
  return p.hora * 60 + p.minuto;
}

/**
 * Converte "YYYY-MM-DD" + "HH:mm" no fuso da empresa para um Date em UTC.
 * Faz duas passadas para acertar a borda do horario de verao.
 */
export function paraUtc(dia: string, hora: string, fuso: string = FUSO_PADRAO): Date {
  const [ano, mes, d] = dia.split("-").map(Number);
  const [h, min] = hora.split(":").map(Number);
  const palpite = new Date(Date.UTC(ano, mes - 1, d, h, min, 0));
  const off1 = offsetMinutos(palpite, fuso);
  const corrigido = new Date(palpite.getTime() - off1 * 60000);
  const off2 = offsetMinutos(corrigido, fuso);
  return off2 === off1 ? corrigido : new Date(palpite.getTime() - off2 * 60000);
}

/** Intervalo [inicio, fim) em UTC que cobre o dia local informado. */
export function limitesDoDia(dia: string, fuso: string = FUSO_PADRAO) {
  const inicio = paraUtc(dia, "00:00", fuso);
  const fim = new Date(paraUtc(dia, "00:00", fuso).getTime() + 24 * 60 * 60000);
  // Recalcula a partir do dia seguinte para respeitar dias de 23h/25h.
  const proximo = new Date(inicio.getTime() + 36 * 60 * 60000);
  const fimExato = paraUtc(diaDe(proximo, fuso), "00:00", fuso);
  return { inicio, fim: fimExato > inicio ? fimExato : fim };
}

/** "2026-08-13" -> "13/08/2026" */
export function diaBr(dia: string): string {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

/** "2026-08-13" -> "qui" */
export function diaSemanaCurto(dia: string): string {
  const nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return nomes[diaSemanaNumero(dia)];
}

export function diaSemanaNumero(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** 495 -> "08:15" (aceita negativos: -30 -> "-00:30") */
export function minutosParaHoras(min: number): string {
  const sinal = min < 0 ? "-" : "";
  const abs = Math.abs(Math.round(min));
  return `${sinal}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** Converte "HH:mm" em minutos desde a meia-noite. */
export function horaParaMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/** Hoje no fuso da empresa. */
export function hojeStr(fuso: string = FUSO_PADRAO): string {
  return diaDe(new Date(), fuso);
}

/** Soma dias a uma competencia YYYY-MM-DD. */
export function somaDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** Lista de competencias entre duas datas (inclusive). */
export function intervaloDeDias(de: string, ate: string): string[] {
  const dias: string[] = [];
  let atual = de;
  let guarda = 0;
  while (atual <= ate && guarda++ < 400) {
    dias.push(atual);
    atual = somaDias(atual, 1);
  }
  return dias;
}

/** Primeiro e ultimo dia do mes de uma competencia. */
export function limitesDoMes(dia: string) {
  const [a, m] = dia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { de: `${a}-${mm}-01`, ate: `${a}-${mm}-${String(ultimo).padStart(2, "0")}` };
}
