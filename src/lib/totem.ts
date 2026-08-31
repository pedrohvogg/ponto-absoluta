import "server-only";
import type { Config, Usuario } from "@prisma/client";
import { prisma } from "./prisma";
import { descriptorValido, identificar, melhorDistancia } from "./face";

/**
 * Identificacao de funcionarios no totem da loja.
 *
 * Regra de ouro deste modulo: o cliente nunca diz de quem e o rosto. Ele envia
 * apenas o vetor capturado (e, no maximo, uma matricula digitada); quem decide
 * de quem e o ponto e sempre o servidor, a partir das biometrias cadastradas.
 */

/** Campos do funcionario que o totem precisa conhecer. */
const SELECAO = {
  id: true,
  nome: true,
  matricula: true,
  cargo: true,
  termoAceiteEm: true,
  cargaDiariaMinutos: true,
  entradaPrevista: true,
  saidaPrevista: true,
  intervaloMinutos: true,
  diasSemana: true,
} as const;

export type FuncionarioDoTotem = Pick<Usuario, keyof typeof SELECAO & keyof Usuario>;

export type ResultadoTotem =
  | { situacao: "IDENTIFICADO"; funcionario: FuncionarioDoTotem; distancia: number }
  /// Ninguem cadastrado ficou perto o suficiente do rosto capturado.
  | { situacao: "DESCONHECIDO" }
  /// Dois funcionarios ficaram parecidos demais: pedir a matricula.
  | { situacao: "AMBIGUO" }
  /// Matricula digitada nao existe (ou pertence a alguem sem rosto cadastrado).
  | { situacao: "MATRICULA_INVALIDA" }
  /// A matricula existe, mas o rosto na camera nao e o dela.
  | { situacao: "ROSTO_NAO_CONFERE" }
  /// Nenhum funcionario tem rosto cadastrado ainda.
  | { situacao: "SEM_CADASTROS" };

/**
 * Descobre de quem e o rosto.
 *
 * Sem matricula, procura entre todos os funcionarios ativos (1:N, mais
 * rigoroso). Com matricula, confere so contra aquela pessoa (1:1, mais
 * preciso) — e esse e o caminho usado quando a busca automatica fica em
 * duvida entre dois funcionarios parecidos.
 */
export async function identificarNoTotem(
  descriptor: number[],
  config: Config,
  matricula?: string | null,
): Promise<ResultadoTotem> {
  if (matricula) {
    const alvo = await prisma.usuario.findFirst({
      where: { matricula: matricula.trim().toUpperCase(), papel: "FUNCIONARIO", ativo: true },
      select: { ...SELECAO, biometrias: { select: { descriptor: true } } },
    });
    if (!alvo || alvo.biometrias.length === 0) return { situacao: "MATRICULA_INVALIDA" };

    const cadastradas = alvo.biometrias
      .map((b) => b.descriptor)
      .filter(descriptorValido) as unknown as number[][];
    const distancia = melhorDistancia(descriptor, cadastradas);

    // Com a pessoa ja identificada pela matricula, vale o limiar 1:1 normal.
    if (distancia === null || distancia > config.limiarFacial) {
      return { situacao: "ROSTO_NAO_CONFERE" };
    }
    const { biometrias: _ignorado, ...funcionario } = alvo;
    return { situacao: "IDENTIFICADO", funcionario, distancia };
  }

  const equipe = await prisma.usuario.findMany({
    where: { papel: "FUNCIONARIO", ativo: true, biometrias: { some: {} } },
    select: { ...SELECAO, biometrias: { select: { descriptor: true } } },
  });
  if (equipe.length === 0) return { situacao: "SEM_CADASTROS" };

  const candidatos = equipe.map((pessoa) => {
    const { biometrias, ...funcionario } = pessoa;
    return {
      referencia: funcionario,
      descriptors: biometrias
        .map((b) => b.descriptor)
        .filter(descriptorValido) as unknown as number[][],
    };
  });

  const resultado = identificar(descriptor, candidatos, config.limiarTotem, config.margemTotem);

  if (resultado.situacao === "DESCONHECIDO") return { situacao: "DESCONHECIDO" };
  if (resultado.situacao === "AMBIGUO") return { situacao: "AMBIGUO" };
  return {
    situacao: "IDENTIFICADO",
    funcionario: resultado.referencia,
    distancia: resultado.distancia,
  };
}

/** Mensagem que o totem mostra na tela para cada desfecho que nao identificou. */
export const MENSAGEM_TOTEM: Record<Exclude<ResultadoTotem["situacao"], "IDENTIFICADO">, string> = {
  DESCONHECIDO:
    "Não reconhecemos seu rosto. Aproxime-se, melhore a luz e tente de novo — ou digite sua matrícula.",
  AMBIGUO:
    "Precisamos confirmar quem é você. Digite sua matrícula para continuar.",
  MATRICULA_INVALIDA:
    "Matrícula não encontrada, ou você ainda não tem o rosto cadastrado. Fale com o responsável.",
  ROSTO_NAO_CONFERE:
    "O rosto não confere com essa matrícula. Tente novamente ou fale com o responsável.",
  SEM_CADASTROS: "Nenhum funcionário tem rosto cadastrado ainda. Fale com o responsável.",
};
