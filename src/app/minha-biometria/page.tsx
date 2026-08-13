import { exigirFuncionario } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { obterConfig } from "@/lib/config";
import Cabecalho from "@/components/Cabecalho";
import GerenciarBiometria from "@/components/GerenciarBiometria";

export const dynamic = "force-dynamic";

export default async function PaginaMinhaBiometria() {
  const sessao = await exigirFuncionario();
  const config = await obterConfig();

  const biometrias = await prisma.biometria.findMany({
    where: { usuarioId: sessao.id },
    orderBy: { criadoEm: "desc" },
    select: { id: true, fotoBase64: true, criadoEm: true },
  });

  return (
    <>
      <Cabecalho sessao={sessao} nomeEmpresa={config.nomeEmpresa} />
      <main className="mx-auto max-w-3xl space-y-6 p-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Meu rosto</h1>
          <p className="text-sm text-slate-500">
            Cadastre seu rosto para conseguir bater o ponto. Recomendamos 3 capturas em
            condições diferentes (com e sem óculos, luz do dia e luz artificial).
          </p>
        </div>

        <GerenciarBiometria
          biometriasIniciais={biometrias.map((b) => ({
            id: b.id,
            foto: b.fotoBase64,
            criadoEm: b.criadoEm.toISOString(),
          }))}
        />

        <div className="cartao p-4 text-sm text-slate-600">
          <h2 className="mb-2 font-semibold text-slate-800">Como seus dados são tratados</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              Guardamos um <strong>vetor matemático</strong> gerado a partir do seu rosto — não é
              possível reconstruir sua foto a partir dele.
            </li>
            <li>
              O reconhecimento acontece <strong>no seu próprio dispositivo</strong>; nenhum vídeo é
              enviado para servidores.
            </li>
            <li>
              {config.salvarFoto
                ? "Uma miniatura da selfie de cada registro é guardada como comprovante para conferência do RH."
                : "As selfies dos registros não são armazenadas."}
            </li>
            <li>Você pode remover suas capturas a qualquer momento nesta página.</li>
          </ul>
        </div>
      </main>
    </>
  );
}
