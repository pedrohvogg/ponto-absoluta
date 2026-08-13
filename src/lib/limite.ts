import "server-only";

type Janela = { contador: number; expiraEm: number };

const memoria = new Map<string, Janela>();

/**
 * Limitador simples por chave, em memoria do processo.
 * Suficiente para uma instancia; em ambiente com varias replicas troque por
 * Redis/Upstash mantendo a mesma assinatura.
 */
export function limitar(
  chave: string,
  maximo: number,
  janelaSegundos: number,
): { permitido: boolean; restam: number; esperarSegundos: number } {
  const agora = Date.now();
  const atual = memoria.get(chave);

  if (!atual || atual.expiraEm < agora) {
    memoria.set(chave, { contador: 1, expiraEm: agora + janelaSegundos * 1000 });
    return { permitido: true, restam: maximo - 1, esperarSegundos: 0 };
  }

  atual.contador += 1;
  if (atual.contador > maximo) {
    return {
      permitido: false,
      restam: 0,
      esperarSegundos: Math.ceil((atual.expiraEm - agora) / 1000),
    };
  }
  return { permitido: true, restam: maximo - atual.contador, esperarSegundos: 0 };
}

export function zerarLimite(chave: string) {
  memoria.delete(chave);
}

/** Limpa janelas vencidas de tempos em tempos para nao crescer sem limite. */
setInterval(
  () => {
    const agora = Date.now();
    for (const [k, v] of memoria) if (v.expiraEm < agora) memoria.delete(k);
  },
  5 * 60 * 1000,
).unref?.();
