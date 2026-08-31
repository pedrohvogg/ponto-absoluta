import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Papel } from "@prisma/client";

const COOKIE = "ponto_sessao";
const DURACAO_HORAS = 12;
/**
 * O tablet da loja fica ligado o dia todo: expirar a cada 12 h obrigaria alguem
 * a refazer login toda manha. A conta do totem nao tem privilegio nenhum (so
 * abre o quiosque), entao uma sessao longa aqui custa pouco e evita a loja
 * ficar sem bater ponto porque ninguem sabia a senha do tablet.
 */
const DURACAO_HORAS_TOTEM = 30 * 24;

export type Sessao = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  trocarSenha: boolean;
  /// Falso apenas quando o usuario e FUNCIONARIO e ainda nao aceitou o termo
  /// de uso de imagem/biometria. Para ADMIN vale sempre true (nao se aplica).
  termoAceito: boolean;
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
  const horas = dados.papel === "TOTEM" ? DURACAO_HORAS_TOTEM : DURACAO_HORAS;

  const token = await new SignJWT({ ...dados })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${horas}h`)
    .sign(chave());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: horas * 60 * 60,
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
      termoAceito: Boolean(payload.termoAceito),
    };
  } catch {
    return null;
  }
}

export async function encerrarSessao() {
  (await cookies()).delete(COOKIE);
}

export const NOME_COOKIE = COOKIE;
