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
