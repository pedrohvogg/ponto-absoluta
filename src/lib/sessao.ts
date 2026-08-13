import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Papel } from "@prisma/client";

const COOKIE = "ponto_sessao";
const DURACAO_HORAS = 12;

export type Sessao = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  trocarSenha: boolean;
};

function chave(): Uint8Array {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 32) {
    throw new Error(
      "SESSION_SECRET ausente ou curto demais. Defina uma chave de 32+ caracteres no .env",
    );
  }
  return new TextEncoder().encode(segredo);
}

export async function criarSessao(dados: Sessao) {
  const token = await new SignJWT({ ...dados })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_HORAS}h`)
    .sign(chave());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_HORAS * 60 * 60,
  });
}

export async function lerSessao(): Promise<Sessao | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, chave());
    return {
      id: String(payload.id),
      nome: String(payload.nome),
      email: String(payload.email),
      papel: payload.papel as Papel,
      trocarSenha: Boolean(payload.trocarSenha),
    };
  } catch {
    return null;
  }
}

export async function encerrarSessao() {
  (await cookies()).delete(COOKIE);
}

export const NOME_COOKIE = COOKIE;
