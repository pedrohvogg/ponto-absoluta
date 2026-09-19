import { z } from "zod";

export const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DIA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const esquemaHora = z.string().regex(HORA_REGEX, "Horário deve estar no formato HH:mm");
export const esquemaDia = z.string().regex(DIA_REGEX, "Data deve estar no formato AAAA-MM-DD");

export const esquemaJornada = z.object({
  cargaDiariaMinutos: z.number().int().min(0).max(1440),
  entradaPrevista: esquemaHora,
  saidaPrevista: esquemaHora,
  intervaloMinutos: z.number().int().min(0).max(480),
  diasSemana: z.array(z.number().int().min(0).max(6)).max(7),
  /// Data de admissão: antes dela o relatório não cobra jornada.
  admissaoEm: esquemaDia.nullable().optional().or(z.literal("").transform(() => null)),
  /// Horários por dia da semana. Ausente mantém só o padrão acima, que é o
  /// comportamento de quem foi cadastrado antes desta tela existir.
  horarios: z
    .array(
      z.object({
        diaSemana: z.number().int().min(0).max(6),
        trabalha: z.boolean(),
        entrada: esquemaHora,
        saida: esquemaHora,
        intervaloMinutos: z.number().int().min(0).max(480),
        cargaMinutos: z.number().int().min(0).max(1440),
      }),
    )
    .max(7)
    .optional()
    // Dois horários para o mesmo dia da semana deixariam a escala ambígua.
    .refine(
      (lista) => !lista || new Set(lista.map((h) => h.diaSemana)).size === lista.length,
      "Há mais de um horário para o mesmo dia da semana.",
    ),
});

export const esquemaAusencia = z
  .object({
    usuarioId: z.string().min(1, "Selecione o funcionário."),
    tipo: z.enum(["FERIAS", "FOLGA", "ATESTADO", "LICENCA", "OUTRO"]).default("FERIAS"),
    inicio: esquemaDia,
    fim: esquemaDia,
    observacao: z.string().trim().max(500).optional().nullable(),
  })
  .refine((d) => d.inicio <= d.fim, {
    message: "A data final não pode ser anterior à inicial.",
    path: ["fim"],
  });

/** Ajuste proposto pelo administrador, que o funcionário ainda vai confirmar. */
export const esquemaPropostaAjuste = z
  .object({
    usuarioId: z.string().min(1, "Selecione o funcionário."),
    acao: z.enum(["INCLUIR", "ALTERAR", "EXCLUIR"]),
    dia: esquemaDia,
    tipo: z.enum(["ENTRADA", "INICIO_INTERVALO", "FIM_INTERVALO", "SAIDA"]),
    horario: esquemaHora.nullable().optional(),
    registroAlvoId: z.string().nullable().optional(),
    motivo: z.string().trim().min(10, "Explique o motivo com pelo menos 10 caracteres.").max(500),
  })
  .refine((d) => d.acao === "EXCLUIR" || !!d.horario, {
    message: "Informe o horário do ajuste.",
    path: ["horario"],
  })
  .refine((d) => d.acao === "INCLUIR" || !!d.registroAlvoId, {
    message: "Selecione o registro que será corrigido.",
    path: ["registroAlvoId"],
  });

export const esquemaFuncionario = esquemaJornada.extend({
  nome: z.string().trim().min(3, "Informe o nome completo.").max(120),
  /// Ausente quando o funcionário bate ponto só pelo totem, sem acesso próprio.
  /// Administradores e a conta do totem sempre precisam de e-mail para entrar.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido.")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  matricula: z
    .string()
    .trim()
    .min(1, "Informe a matrícula.")
    .max(20)
    .regex(/^[A-Za-z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou underline.")
    // Normalizada em maiúsculas para que "t10" e "T10" nunca coexistam.
    .transform((v) => v.toUpperCase()),
  cargo: z.string().trim().max(80).optional().nullable(),
  departamento: z.string().trim().max(80).optional().nullable(),
  papel: z.enum(["ADMIN", "FUNCIONARIO", "TOTEM"]).default("FUNCIONARIO"),
});

/** Só funcionário pode existir sem login; admin e totem precisam entrar no sistema. */
export function exigeCredenciais(papel: string): boolean {
  return papel !== "FUNCIONARIO";
}

export const esquemaConfig = z.object({
  nomeEmpresa: z.string().trim().min(1).max(120),
  fusoHorario: z.string().trim().min(1).max(60),
  geofenceAtiva: z.boolean(),
  geofenceBloqueia: z.boolean(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  raioMetros: z.number().int().min(20).max(50000),
  limiarFacial: z.number().min(0.3).max(0.7),
  // Opcionais: quem não enviar mantém o valor atual, para que um cliente antigo
  // não sobrescreva nem quebre ao salvar as demais configurações.
  limiarTotem: z.number().min(0.3).max(0.6).optional(),
  margemTotem: z.number().min(0).max(0.3).optional(),
  salvarFoto: z.boolean(),
  intervaloMinimoMinutos: z.number().int().min(0).max(120),
  toleranciaMinutos: z.number().int().min(0).max(120),
});

/** Mensagem legível do primeiro problema de validação. */
export function primeiroErro(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Dados inválidos.";
}
