/**
 * Comparacao de assinaturas faciais.
 *
 * O vetor de 128 dimensoes e gerado no navegador pelo face-api; a comparacao
 * acontece SEMPRE no servidor, para que o cliente nao possa decidir sozinho
 * se o rosto confere.
 */

export const TAMANHO_DESCRIPTOR = 128;

export function descriptorValido(valor: unknown): valor is number[] {
  return (
    Array.isArray(valor) &&
    valor.length === TAMANHO_DESCRIPTOR &&
    valor.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/** Distancia euclidiana entre dois descriptors (0 = identico). */
export function distanciaEuclidiana(a: number[], b: number[]): number {
  let soma = 0;
  for (let i = 0; i < a.length; i++) soma += (a[i] - b[i]) ** 2;
  return Math.sqrt(soma);
}

/** Menor distancia entre o rosto capturado e as biometrias cadastradas. */
export function melhorDistancia(alvo: number[], cadastradas: number[][]): number | null {
  let melhor: number | null = null;
  for (const d of cadastradas) {
    if (d.length !== alvo.length) continue;
    const dist = distanciaEuclidiana(alvo, d);
    if (melhor === null || dist < melhor) melhor = dist;
  }
  return melhor;
}

/** Converte a distancia em um percentual amigavel de confianca. */
export function confiancaPercentual(distancia: number): number {
  return Math.max(0, Math.min(100, Math.round((1 - distancia / 0.8) * 100)));
}

// ---------------------------------------------------------------------------
// Identificacao 1:N (totem)
// ---------------------------------------------------------------------------

export type Candidato<T> = { referencia: T; descriptors: number[][] };

export type ResultadoIdentificacao<T> =
  | { situacao: "IDENTIFICADO"; referencia: T; distancia: number; margem: number }
  /// Nenhum rosto cadastrado ficou perto o suficiente.
  | { situacao: "DESCONHECIDO"; melhorDistancia: number | null }
  /// Dois funcionarios ficaram parecidos demais para decidir com seguranca.
  | { situacao: "AMBIGUO"; distancia: number; margem: number };

/**
 * Descobre de quem e o rosto entre varios funcionarios cadastrados.
 *
 * Diferente da conferencia 1:1, aqui nao basta o rosto estar dentro do limite:
 * ele precisa estar claramente mais perto de UMA pessoa do que de todas as
 * outras. Sem essa margem, dois funcionarios parecidos (ou irmaos, ou gemeos)
 * levariam o sistema a bater o ponto na pessoa errada — um erro pior do que
 * simplesmente pedir a matricula.
 */
export function identificar<T>(
  alvo: number[],
  candidatos: Candidato<T>[],
  limiar: number,
  margemMinima: number,
): ResultadoIdentificacao<T> {
  const distancias: { referencia: T; distancia: number }[] = [];

  for (const candidato of candidatos) {
    const d = melhorDistancia(alvo, candidato.descriptors);
    if (d !== null) distancias.push({ referencia: candidato.referencia, distancia: d });
  }

  if (distancias.length === 0) return { situacao: "DESCONHECIDO", melhorDistancia: null };

  distancias.sort((a, b) => a.distancia - b.distancia);
  const melhor = distancias[0];
  const segundo = distancias[1];
  // Sem segundo colocado nao ha com o que confundir: a margem e "infinita".
  const margem = segundo ? segundo.distancia - melhor.distancia : Number.POSITIVE_INFINITY;

  if (melhor.distancia > limiar) {
    return { situacao: "DESCONHECIDO", melhorDistancia: melhor.distancia };
  }
  if (margem < margemMinima) {
    return { situacao: "AMBIGUO", distancia: melhor.distancia, margem };
  }
  return {
    situacao: "IDENTIFICADO",
    referencia: melhor.referencia,
    distancia: melhor.distancia,
    margem,
  };
}
