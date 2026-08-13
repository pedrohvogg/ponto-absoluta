import "server-only";
import type { Config } from "@prisma/client";
import { prisma } from "./prisma";

/** Le (criando na primeira vez) a linha unica de configuracao da empresa. */
export async function obterConfig(): Promise<Config> {
  const existente = await prisma.config.findUnique({ where: { id: "default" } });
  if (existente) return existente;
  return prisma.config.create({ data: { id: "default" } });
}
