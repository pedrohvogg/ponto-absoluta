import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { conferirSenha } from "@/lib/senha";
import { criarSessao } from "@/lib/sessao";
import { limitar, zerarLimite } from "@/lib/limite";
import { ipDaRequisicao } from "@/lib/requisicao";

const corpo = z.object({
  identificador: z.string().trim().min(1, "Informe seu e-mail ou matrícula."),
  senha: z.string().min(1, "Informe sua senha."),
});

export async function POST(req: Request) {
  const dados = corpo.safeParse(await req.json().catch(() => null));
  if (!dados.success) {
    return NextResponse.json(
      { erro: dados.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 },
    );
  }

  const identificador = dados.data.identificador.toLowerCase();
  const ip = ipDaRequisicao(req);

  // Trava por IP e por conta, para conter tentativas de força bruta.
  for (const chave of [`login:ip:${ip}`, `login:conta:${identificador}`]) {
    const { permitido, esperarSegundos } = limitar(chave, 8, 300);
    if (!permitido) {
      return NextResponse.json(
        {
          erro: `Muitas tentativas. Tente novamente em ${Math.ceil(esperarSegundos / 60)} minuto(s).`,
        },
        { status: 429 },
      );
    }
  }

  // E-mail é gravado em minúsculas e a matrícula em maiúsculas, então o
  // identificador digitado é comparado nas duas formas.
  const usuario = await prisma.usuario.findFirst({
    where: {
      OR: [
        { email: identificador },
        { matricula: dados.data.identificador.trim().toUpperCase() },
      ],
    },
  });

  const generico = { erro: "E-mail/matrícula ou senha incorretos." };
  if (!usuario) return NextResponse.json(generico, { status: 401 });
  if (!(await conferirSenha(dados.data.senha, usuario.senhaHash))) {
    await prisma.auditoria.create({
      data: { usuarioId: usuario.id, acao: "LOGIN_FALHOU", ip },
    });
    return NextResponse.json(generico, { status: 401 });
  }
  if (!usuario.ativo) {
    return NextResponse.json(
      { erro: "Este acesso está desativado. Fale com o administrador." },
      { status: 403 },
    );
  }

  zerarLimite(`login:conta:${identificador}`);

  await criarSessao({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    trocarSenha: usuario.trocarSenha,
  });

  await prisma.$transaction([
    prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoLogin: new Date() } }),
    prisma.auditoria.create({ data: { usuarioId: usuario.id, acao: "LOGIN", ip } }),
  ]);

  const destino = usuario.trocarSenha
    ? "/trocar-senha"
    : usuario.papel === "ADMIN"
      ? "/admin"
      : "/ponto";

  return NextResponse.json({ ok: true, destino });
}
