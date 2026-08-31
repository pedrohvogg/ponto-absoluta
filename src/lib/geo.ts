/** Distancia em metros entre dois pontos (formula de Haversine). */
export function distanciaMetros(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export function formatarDistancia(m: number | null | undefined): string {
  if (m == null) return "—";
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

/**
 * Margem maxima de erro de GPS aceita, em metros.
 *
 * A imprecisao do aparelho conta a favor do funcionario, mas com teto: o valor
 * de `precisaoMetros` chega do navegador e poderia ser forjado. Sem o teto,
 * declarar "precisao de 5 km" liberaria a batida de qualquer lugar.
 */
export const MARGEM_GPS_MAXIMA = 100;

/** Decide se uma leitura de GPS coloca a pessoa dentro da cerca virtual. */
export function dentroDaCerca(
  distancia: number,
  raioMetros: number,
  precisaoMetros: number | null | undefined,
): boolean {
  const margem = Math.min(Math.max(precisaoMetros ?? 0, 0), MARGEM_GPS_MAXIMA);
  return distancia - margem <= raioMetros;
}
