import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminDaApi } from "@/lib/auth";
import { gerarHash, senhaProvisoria } from "@/lib/senha";
import { esquemaFuncionario, exigeCredenciais, primeiroErro } from "@/lib/validacao";
import { ipDaRequisicao } from "@/lib/requisicao";

export async function POST(req: Request) {
  const admin = await adminDaApi();
  if (!admin) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const parse = esquemaFuncionario.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: primeiroErro(parse.error) }, { status: 400 });
  }
  const dados = parse.data;

  if (exigeCredenciais(dados.papel) && !dados.email) {
    return NextResponse.json(
      {
        erro:
          dados.papel === "TOTEM"
            ? "A conta do totem precisa de um e-mail para entrar no tablet."
            : "Administradores precisam de e-mail para entrar no sistema.",
      },
      { status: 400 },
    );
  }

  // Sem e-mail, o funcionário não tem como entrar: é o caso de quem bate ponto
  // apenas pelo totem. Nesse caso não geramos senha nenhuma.
  const comLogin = Boolean(dados.email);
  const senha = comLogin ? senhaProvisoria() : null;

  try {
    const usuario = await prisma.usuario.create({
      data: {
        nome: dados.nome,
        email: dados.email ?? null,
        matricula: dados.matricula,
        cargo: dados.cargo || null,
        departamento: dados.departamento || null,
        papel: dados.papel,
        senhaHash: senha ? await gerarHash(senha) : null,
        trocarSenha: comLogin,
        cargaDiariaMinutos: dados.cargaDiariaMinutos,
        entradaPrevista: dados.entradaPrevista,
        saidaPrevista: dados.saidaPrevista,
        intervaloMinutos: dados.intervaloMinutos,
        diasSemana: dados.diasSemana,
      },
      select: { id: true, nome: true, email: true, matricula: true, papel: true },
    });

    await prisma.auditoria.create({
      data: {
        usuarioId: admin.id,
        acao: "FUNCIONARIO_CRIADO",
        detalhe: `${usuario.nome} (${usuario.papel}) ${usuario.email ? `<${usuario.email}>` : "sem login — só totem"}`,
        ip: ipDaRequisicao(req),
      },
    });

    // A senha provisória só aparece aqui — depois disso, apenas o hash existe.
    return NextResponse.json({ ok: true, usuario, senhaProvisoria: senha, comLogin });
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
