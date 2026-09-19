import "server-only";
import type { Prisma } from "@prisma/client";
import { paraUtc } from "./datas";

/** Os campos de uma solicitacao necessarios para aplicar o ajuste. */
export type AjusteAplicavel = {
  usuarioId: string;
  acao: "INCLUIR" | "ALTERAR" | "EXCLUIR";
  dia: string;
  tipo: "ENTRADA" | "INICIO_INTERVALO" | "FIM_INTERVALO" | "SAIDA";
  horario: string | null;
  registroAlvoId: string | null;
  motivo: string;
};

/**
 * Aplica no espelho de ponto um ajuste ja decidido.
 *
 * Vive aqui porque dois caminhos chegam ao mesmo efeito: o administrador
 * aprovando o pedido do funcionario, e o funcionario dando o de-acordo no
 * ajuste proposto pelo administrador. Duplicar essa gravacao seria pedir para
 * os dois lados divergirem com o tempo.
 *
 * Sempre chamada dentro de uma transacao, junto da mudanca de status.
 */
export async function aplicarAjuste(
  tx: Prisma.TransactionClient,
  solicitacao: AjusteAplicavel,
  fuso: string,
  lancadoPorId: string | null,
): Promise<void> {
  const observacao = `Ajuste aprovado: ${solicitacao.motivo}`;

  if (solicitacao.acao === "INCLUIR" && solicitacao.horario) {
    await tx.registro.create({
      data: {
        usuarioId: solicitacao.usuarioId,
        tipo: solicitacao.tipo,
        momento: paraUtc(solicitacao.dia, solicitacao.horario, fuso),
        dia: solicitacao.dia,
        origem: "AJUSTE",
        observacao,
        lancadoPorId,
      },
    });
    return;
  }

  if (solicitacao.acao === "ALTERAR" && solicitacao.registroAlvoId && solicitacao.horario) {
    await tx.registro.update({
      where: { id: solicitacao.registroAlvoId },
      data: {
        momento: paraUtc(solicitacao.dia, solicitacao.horario, fuso),
        tipo: solicitacao.tipo,
        origem: "AJUSTE",
        observacao,
        lancadoPorId,
      },
    });
    return;
  }

  if (solicitacao.acao === "EXCLUIR" && solicitacao.registroAlvoId) {
    // deleteMany em vez de delete: se o registro ja sumiu por outro caminho, o
    // ajuste nao deve estourar e desfazer a transacao inteira.
    await tx.registro.deleteMany({ where: { id: solicitacao.registroAlvoId } });
  }
}
