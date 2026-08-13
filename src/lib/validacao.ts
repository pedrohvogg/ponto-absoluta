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
});

export const esquemaFuncionario = esquemaJornada.extend({
  nome: z.string().trim().min(3, "Informe o nome completo.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
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
  papel: z.enum(["ADMIN", "FUNCIONARIO"]).default("FUNCIONARIO"),
});

export const esquemaConfig = z.object({
  nomeEmpresa: z.string().trim().min(1).max(120),
  fusoHorario: z.string().trim().min(1).max(60),
  geofenceAtiva: z.boolean(),
  geofenceBloqueia: z.boolean(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  raioMetros: z.number().int().min(20).max(50000),
  limiarFacial: z.number().min(0.3).max(0.7),
  salvarFoto: z.boolean(),
  intervaloMinimoMinutos: z.number().int().min(0).max(120),
  toleranciaMinutos: z.number().int().min(0).max(120),
});

/** Mensagem legível do primeiro problema de validação. */
export function primeiroErro(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Dados inválidos.";
}
