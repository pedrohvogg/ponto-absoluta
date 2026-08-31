/**
 * Popula o banco com a configuração inicial e o primeiro administrador.
 * Execute com: npm run db:seed
 *
 * É idempotente: rodar de novo não duplica nada.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Lê uma variável numérica do .env, ignorando valores vazios ou inválidos. */
function numeroDoAmbiente(chave: string): number | undefined {
  const bruto = process.env[chave]?.trim();
  if (!bruto) return undefined;
  const valor = Number(bruto);
  if (!Number.isFinite(valor)) {
    throw new Error(`${chave} precisa ser um número (recebido: "${bruto}").`);
  }
  return valor;
}

/**
 * Configuração da empresa vinda do .env. Só as chaves informadas são aplicadas,
 * para que rodar o seed de novo não desfaça ajustes feitos na tela.
 */
function configDoAmbiente() {
  const latitude = numeroDoAmbiente("EMPRESA_LATITUDE");
  const longitude = numeroDoAmbiente("EMPRESA_LONGITUDE");
  const raioMetros = numeroDoAmbiente("EMPRESA_RAIO_METROS");
  const temLocal = latitude !== undefined && longitude !== undefined;

  if ((latitude === undefined) !== (longitude === undefined)) {
    throw new Error("Informe EMPRESA_LATITUDE e EMPRESA_LONGITUDE juntas, ou nenhuma das duas.");
  }
  if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
    throw new Error("EMPRESA_LATITUDE deve estar entre -90 e 90.");
  }
  if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
    throw new Error("EMPRESA_LONGITUDE deve estar entre -180 e 180.");
  }

  return {
    ...(process.env.EMPRESA_NOME ? { nomeEmpresa: process.env.EMPRESA_NOME } : {}),
    ...(process.env.EMPRESA_FUSO ? { fusoHorario: process.env.EMPRESA_FUSO } : {}),
    ...(temLocal
      ? {
          latitude,
          longitude,
          geofenceAtiva: true,
          // Bloquear o registro fora do raio é decisão da empresa: por padrão
          // apenas sinalizamos no painel, sem impedir a batida.
          geofenceBloqueia: process.env.EMPRESA_GEOFENCE_BLOQUEIA === "true",
        }
      : {}),
    ...(raioMetros !== undefined ? { raioMetros } : {}),
  };
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@empresa.com").toLowerCase();
  const senha = process.env.ADMIN_SENHA ?? "admin123";
  const empresa = configDoAmbiente();

  const config = await prisma.config.upsert({
    where: { id: "default" },
    update: empresa,
    create: {
      id: "default",
      nomeEmpresa: "Minha Empresa",
      fusoHorario: "America/Sao_Paulo",
      ...empresa,
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
  console.log(`   Empresa: ${config.nomeEmpresa} (${config.fusoHorario})`);
  console.log(
    config.geofenceAtiva && config.latitude != null
      ? `   Cerca virtual: ${config.latitude}, ${config.longitude} · raio ${config.raioMetros} m · ${
          config.geofenceBloqueia ? "bloqueia registro fora do raio" : "apenas sinaliza"
        }`
      : "   Cerca virtual: desligada (defina em Configurações ou no .env)",
  );
  console.log("\n   Acesse /login com:");
  console.log(`   e-mail: ${admin.email}`);
  console.log(`   senha:  ${senha}  (será exigida a troca no primeiro acesso)\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
