import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { telaInicial, usuarioDaApi } from "@/lib/auth";
import { conferirSenha, gerarHash, validarForcaSenha } from "@/lib/senha";
import { criarSessao } from "@/lib/sessao";
import { ipDaRequisicao } from "@/lib/requisicao";

const corpo = z.object({
  senhaAtual: z.string().min(1, "Informe a senha atual."),
  novaSenha: z.string().min(1, "Informe a nova senha."),
});

export async function POST(req: Request) {
  const sessao = await usuarioDaApi();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });

  const dados = corpo.safeParse(await req.json().catch(() => null));
  if (!dados.success) {
    return NextResponse.json({ erro: dados.error.issues[0]?.message }, { status: 400 });
  }

  const problema = validarForcaSenha(dados.data.novaSenha);
  if (problema) return NextResponse.json({ erro: problema }, { status: 400 });

  const usuario = await prisma.usuario.findUnique({ where: { id: sessao.id } });
  if (!usuario) return NextResponse.json({ erro: "Usuário não encontrado." }, { status: 404 });
  // Conta sem senha (funcionário que só bate ponto no totem) não troca senha.
  if (!usuario.senhaHash) {
    return NextResponse.json({ erro: "Esta conta não usa senha." }, { status: 409 });
  }

  if (!(await conferirSenha(dados.data.senhaAtual, usuario.senhaHash))) {
    return NextResponse.json({ erro: "Senha atual incorreta." }, { status: 400 });
  }
  if (await conferirSenha(dados.data.novaSenha, usuario.senhaHash)) {
    return NextResponse.json({ erro: "A nova senha deve ser diferente da atual." }, { status: 400 });
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senhaHash: await gerarHash(dados.data.novaSenha), trocarSenha: false },
  });
  await prisma.auditoria.create({
    data: { usuarioId: usuario.id, acao: "SENHA_ALTERADA", ip: ipDaRequisicao(req) },
  });

  // Refaz o cookie para limpar a marca de "trocar senha".
  // sessao.termoAceito ja reflete o estado atual do banco (usuarioDaApi confere na hora).
  await criarSessao({ ...sessao, trocarSenha: false });

  const destino = !sessao.termoAceito ? "/termos" : telaInicial(sessao.papel);

  return NextResponse.json({ ok: true, destino });
}
