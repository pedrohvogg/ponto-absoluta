import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { lerSessao, type Sessao } from "./sessao";

/** ADMIN nao bate ponto, entao o termo de biometria nao se aplica a esse papel. */
function precisaAceitarTermo(papel: string, termoAceiteEm: Date | null): boolean {
  return papel === "FUNCIONARIO" && termoAceiteEm === null;
}

/** Garante que existe uma sessao valida e que o usuario continua ativo no banco. */
export async function exigirUsuario(): Promise<Sessao> {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  const usuario = await prisma.usuario.findUnique({
    where: { id: sessao.id },
    select: { ativo: true, papel: true, trocarSenha: true, termoAceiteEm: true },
  });
  if (!usuario || !usuario.ativo) redirect("/login?erro=inativo");

  return {
    ...sessao,
    papel: usuario.papel,
    trocarSenha: usuario.trocarSenha,
    termoAceito: !precisaAceitarTermo(usuario.papel, usuario.termoAceiteEm),
  };
}

export async function exigirAdmin(): Promise<Sessao> {
  const sessao = await exigirUsuario();
  if (sessao.papel !== "ADMIN") redirect(telaInicial(sessao.papel));
  return sessao;
}

export async function exigirFuncionario(): Promise<Sessao> {
  const sessao = await exigirUsuario();
  if (sessao.papel !== "FUNCIONARIO") redirect(telaInicial(sessao.papel));
  return sessao;
}

/** Conta do tablet da loja: so pode abrir a tela de quiosque. */
export async function exigirTotem(): Promise<Sessao> {
  const sessao = await exigirUsuario();
  if (sessao.papel !== "TOTEM") redirect(telaInicial(sessao.papel));
  return sessao;
}

/** Para onde cada papel vai depois de entrar. */
export function telaInicial(papel: string): string {
  if (papel === "ADMIN") return "/admin";
  if (papel === "TOTEM") return "/totem";
  return "/ponto";
}

/** Versao para rotas de API: devolve null em vez de redirecionar. */
export async function usuarioDaApi(): Promise<Sessao | null> {
  const sessao = await lerSessao();
  if (!sessao) return null;
  const usuario = await prisma.usuario.findUnique({
    where: { id: sessao.id },
    select: { ativo: true, papel: true, trocarSenha: true, termoAceiteEm: true },
  });
  if (!usuario || !usuario.ativo) return null;
  return {
    ...sessao,
    papel: usuario.papel,
    trocarSenha: usuario.trocarSenha,
    termoAceito: !precisaAceitarTermo(usuario.papel, usuario.termoAceiteEm),
  };
}

export async function adminDaApi(): Promise<Sessao | null> {
  const sessao = await usuarioDaApi();
  return sessao?.papel === "ADMIN" ? sessao : null;
}

export async function totemDaApi(): Promise<Sessao | null> {
  const sessao = await usuarioDaApi();
  return sessao?.papel === "TOTEM" ? sessao : null;
}
