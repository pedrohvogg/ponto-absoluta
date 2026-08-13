/**
 * Popula o banco com a configuração inicial e o primeiro administrador.
 * Execute com: npm run db:seed
 *
 * É idempotente: rodar de novo não duplica nada.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@empresa.com").toLowerCase();
  const senha = process.env.ADMIN_SENHA ?? "admin123";

  await prisma.config.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      nomeEmpresa: "Minha Empresa",
      fusoHorario: "America/Sao_Paulo",
    },
  });

  const admin = await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: {
      nome: "Administrador",
      email,
      matricula: "0001",
      senhaHash: await bcrypt.hash(senha, 10),
      papel: "ADMIN",
      // Força a troca da senha padrão no primeiro acesso.
      trocarSenha: true,
    },
  });

  console.log("\n✅ Banco pronto.\n");
  console.log("   Acesse /login com:");
  console.log(`   e-mail: ${admin.email}`);
  console.log(`   senha:  ${senha}  (será exigida a troca no primeiro acesso)\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
