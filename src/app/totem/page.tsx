import { exigirTotem } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { secoesTermoUso, TEXTO_ACEITE } from "@/lib/termoUso";
import PainelTotem from "./PainelTotem";

export const dynamic = "force-dynamic";

export default async function PaginaTotem() {
  await exigirTotem();
  const config = await obterConfig();

  return (
    <PainelTotem
      nomeEmpresa={config.nomeEmpresa}
      fuso={config.fusoHorario}
      salvarFoto={config.salvarFoto}
      registrarLocalizacao={config.geofenceAtiva}
      termo={{
        secoes: secoesTermoUso(config.nomeEmpresa, config.salvarFoto),
        textoAceite: TEXTO_ACEITE,
      }}
    />
  );
}
