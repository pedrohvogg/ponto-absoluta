import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminDaApi } from "@/lib/auth";
import { gerarHash, senhaProvisoria } from "@/lib/senha";
import { esquemaFuncionario, primeiroErro } from "@/lib/validacao";
import { ipDaRequisicao } from "@/lib/requisicao";

const esquemaEdicao = esquemaFuncionario.partial().extend({
  ativo: z.boolean().optional(),
  /** Ações pontuais disparadas pelos botões da tela do funcionário. */
  acao: z.enum(["RESETAR_SENHA", "LIMPAR_BIOMETRIA"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminDaApi();
  if (!admin) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const alvo = await prisma.usuario.findUnique({ where: { id } });
  if (!alvo) return NextResponse.json({ erro: "Funcionário não encontrado." }, { status: 404 });

  const parse = esquemaEdicao.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: primeiroErro(parse.error) }, { status: 400 });
  }
  const dados = parse.data;
  const ip = ipDaRequisicao(req);

  // ---- Ações pontuais ----
  if (dados.acao === "RESETAR_SENHA") {
    const senha = senhaProvisoria();
    await prisma.usuario.update({
      where: { id },
      data: { senhaHash: await gerarHash(senha), trocarSenha: true },
    });
    await prisma.auditoria.create({
      data: { usuarioId: admin.id, acao: "SENHA_RESETADA", detalhe: alvo.nome, ip },
    });
    return NextResponse.json({ ok: true, senhaProvisoria: senha });
  }

  if (dados.acao === "LIMPAR_BIOMETRIA") {
    const { count } = await prisma.biometria.deleteMany({ where: { usuarioId: id } });
    await prisma.auditoria.create({
      data: {
        usuarioId: admin.id,
        acao: "BIOMETRIA_LIMPA",
        detalhe: `${alvo.nome} (${count} captura(s))`,
        ip,
      },
    });
    return NextResponse.json({ ok: true, removidas: count });
  }

  // ---- Edição de cadastro ----
  if (dados.ativo === false && alvo.papel === "ADMIN") {
    const outrosAdmins = await prisma.usuario.count({
      where: { papel: "ADMIN", ativo: true, id: { not: id } },
    });
    if (outrosAdmins === 0) {
      return NextResponse.json(
        { erro: "É preciso manter ao menos um administrador ativo." },
        { status: 409 },
      );
    }
  }
  if (dados.papel === "FUNCIONARIO" && alvo.papel === "ADMIN") {
    const outrosAdmins = await prisma.usuario.count({
      where: { papel: "ADMIN", ativo: true, id: { not: id } },
    });
    if (outrosAdmins === 0) {
      return NextResponse.json(
        { erro: "É preciso manter ao menos um administrador ativo." },
        { status: 409 },
      );
    }
  }

  try {
    const atualizado = await prisma.usuario.update({
      where: { id },
      data: {
        nome: dados.nome,
        email: dados.email,
        matricula: dados.matricula,
        cargo: dados.cargo === undefined ? undefined : dados.cargo || null,
        departamento: dados.departamento === undefined ? undefined : dados.departamento || null,
        papel: dados.papel,
        ativo: dados.ativo,
        cargaDiariaMinutos: dados.cargaDiariaMinutos,
        entradaPrevista: dados.entradaPrevista,
        saidaPrevista: dados.saidaPrevista,
        intervaloMinutos: dados.intervaloMinutos,
        diasSemana: dados.diasSemana,
      },
      select: { id: true, nome: true, ativo: true },
    });

    await prisma.auditoria.create({
      data: {
        usuarioId: admin.id,
        acao: dados.ativo === false ? "FUNCIONARIO_DESATIVADO" : "FUNCIONARIO_ATUALIZADO",
        detalhe: atualizado.nome,
        ip,
      },
    });

    return NextResponse.json({ ok: true, usuario: atualizado });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const campo = (e.meta?.target as string[] | undefined)?.[0];
      return NextResponse.json(
        {
          erro:
            campo === "matricula"
              ? "Já existe um funcionário com esta matrícula."
              : "Já existe um funcionário com este e-mail.",
        },
        { status: 409 },
      );
    }
    throw e;
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminDaApi();
  if (!admin) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  if (id === admin.id) {
    return NextResponse.json({ erro: "Você não pode excluir a própria conta." }, { status: 409 });
  }

  const alvo = await prisma.usuario.findUnique({
    where: { id },
    select: { nome: true, papel: true, _count: { select: { registros: true } } },
  });
  if (!alvo) return NextResponse.json({ erro: "Funcionário não encontrado." }, { status: 404 });

  // Histórico de ponto é documento trabalhista: nunca some junto com o cadastro.
  if (alvo._count.registros > 0) {
    return NextResponse.json(
      {
        erro: `Este funcionário possui ${alvo._count.registros} registro(s) de ponto e não pode ser excluído. Desative o acesso para preservar o histórico.`,
      },
      { status: 409 },
    );
  }

  await prisma.usuario.delete({ where: { id } });
  await prisma.auditoria.create({
    data: {
      usuarioId: admin.id,
      acao: "FUNCIONARIO_EXCLUIDO",
      detalhe: alvo.nome,
      ip: ipDaRequisicao(req),
    },
  });

  return NextResponse.json({ ok: true });
}
