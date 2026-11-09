import "server-only";
import { prisma } from "./prisma";
import type { SemanaMarcada } from "./folgas";

/**
 * Semanas marcadas no painel de folgas para cada funcionário, até `ate`.
 *
 * Traz também as semanas anteriores ao período: é delas que uma semana sem
 * marcação herda a escala. Um ano de semanas por pessoa são ~52 linhas
 * pequenas, então não vale a pena procurar só a última antes do período.
 */
export async function folgasMarcadas(
  usuarioIds: string[],
  ate: string,
): Promise<Map<string, SemanaMarcada[]>> {
  const mapa = new Map<string, SemanaMarcada[]>();
  if (usuarioIds.length === 0) return mapa;
  const linhas = await prisma.folgaSemanal.findMany({
    where: { usuarioId: { in: usuarioIds }, semana: { lte: ate } },
    select: { usuarioId: true, semana: true, dias: true },
  });
  for (const l of linhas) {
    const lista = mapa.get(l.usuarioId) ?? [];
    lista.push({ semana: l.semana, dias: l.dias });
    mapa.set(l.usuarioId, lista);
  }
  return mapa;
}
