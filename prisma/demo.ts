/**
 * Popula o banco com uma equipe fictícia e duas semanas de batidas, para
 * conhecer o sistema sem precisar bater ponto manualmente.
 *
 * Uso: npm run db:demo
 * Não use em produção — cria usuários com senha conhecida.
 */
import { PrismaClient, type TipoRegistro } from "@prisma/client";
import bcrypt from "bcryptjs";
import { diaSemanaNumero, hojeStr, paraUtc, somaDias } from "../src/lib/datas";

const prisma = new PrismaClient();
const FUSO = "America/Sao_Paulo";
const SENHA_DEMO = "Demo12345";

const EQUIPE = [
  { nome: "Ana Souza Pereira", matricula: "1001", cargo: "Atendente", departamento: "Loja" },
  { nome: "Bruno Carvalho Lima", matricula: "1002", cargo: "Estoquista", departamento: "Logística" },
  { nome: "Carla Mendes Rocha", matricula: "1003", cargo: "Supervisora", departamento: "Loja" },
];

/** Varia os horários para o painel não ficar artificial. */
function horarioComVariacao(base: string, minutosDeVariacao: number): string {
  const [h, m] = base.split(":").map(Number);
  const total = h * 60 + m + Math.round((Math.random() * 2 - 1) * minutosDeVariacao);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function main() {
  await prisma.config.upsert({
    where: { id: "default" },
    update: { nomeEmpresa: "Comércio Absoluta Ltda" },
    create: { id: "default", nomeEmpresa: "Comércio Absoluta Ltda", fusoHorario: FUSO },
  });

  const senhaHash = await bcrypt.hash(SENHA_DEMO, 10);
  const hoje = hojeStr(FUSO);

  for (const pessoa of EQUIPE) {
    const usuario = await prisma.usuario.upsert({
      where: { matricula: pessoa.matricula },
      update: {},
      create: {
        ...pessoa,
        email: `${pessoa.nome.split(" ")[0].toLowerCase()}@empresa.com`,
        senhaHash,
        papel: "FUNCIONARIO",
        trocarSenha: false,
      },
    });

    await prisma.registro.deleteMany({ where: { usuarioId: usuario.id } });

    // Duas semanas de jornada, pulando fins de semana e o dia de hoje.
    for (let atras = 14; atras >= 1; atras--) {
      const dia = somaDias(hoje, -atras);
      const semana = diaSemanaNumero(dia);
      if (semana === 0 || semana === 6) continue;
      // Uma falta ocasional deixa o painel mais realista.
      if (Math.random() < 0.07) continue;

      const batidas: [TipoRegistro, string][] = [
        ["ENTRADA", horarioComVariacao("08:00", 12)],
        ["INICIO_INTERVALO", horarioComVariacao("12:00", 8)],
        ["FIM_INTERVALO", horarioComVariacao("13:00", 8)],
        ["SAIDA", horarioComVariacao("17:05", 20)],
      ];

      for (const [tipo, hora] of batidas) {
        await prisma.registro.create({
          data: {
            usuarioId: usuario.id,
            tipo,
            momento: paraUtc(dia, hora, FUSO),
            dia,
            origem: "FACIAL",
            faceDistancia: 0.24 + Math.random() * 0.12,
          },
        });
      }
    }
  }

  // Uma solicitação de ajuste pendente, para a tela do admin não nascer vazia.
  const ana = await prisma.usuario.findUnique({ where: { matricula: "1001" } });
  if (ana) {
    const dia = somaDias(hoje, -3);
    await prisma.solicitacao.deleteMany({ where: { usuarioId: ana.id } });
    await prisma.solicitacao.create({
      data: {
        usuarioId: ana.id,
        acao: "INCLUIR",
        dia,
        tipo: "SAIDA",
        horario: "18:10",
        motivo: "Fiquei além do horário atendendo um cliente e esqueci de bater a saída.",
      },
    });
  }

  console.log("\n✅ Dados de demonstração criados.");
  console.log(`   Funcionários: ${EQUIPE.map((p) => p.matricula).join(", ")}`);
  console.log(`   Senha de todos: ${SENHA_DEMO}`);
  console.log("   (o cadastro facial precisa ser feito por cada um na tela “Meu rosto”)\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
