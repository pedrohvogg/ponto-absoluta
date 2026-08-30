import { obterConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import FormularioConfig from "@/components/FormularioConfig";

export const dynamic = "force-dynamic";

export default async function PaginaConfiguracoes() {
  const config = await obterConfig();
  const auditoria = await prisma.auditoria.findMany({
    orderBy: { criadoEm: "desc" },
    take: 30,
    include: { usuario: { select: { nome: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-500">
          Parâmetros que valem para toda a empresa: local de trabalho, rigor do reconhecimento
          facial e regras de jornada.
        </p>
      </div>

      <FormularioConfig
        inicial={{
          nomeEmpresa: config.nomeEmpresa,
          fusoHorario: config.fusoHorario,
          geofenceAtiva: config.geofenceAtiva,
          geofenceBloqueia: config.geofenceBloqueia,
          latitude: config.latitude,
          longitude: config.longitude,
          raioMetros: config.raioMetros,
          limiarFacial: config.limiarFacial,
          limiarTotem: config.limiarTotem,
          margemTotem: config.margemTotem,
          salvarFoto: config.salvarFoto,
          intervaloMinimoMinutos: config.intervaloMinimoMinutos,
          toleranciaMinutos: config.toleranciaMinutos,
        }}
      />

      <section className="cartao overflow-hidden">
        <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-800">
          Auditoria recente
        </h2>
        {auditoria.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Nada registrado ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {auditoria.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-2 px-4 py-2">
                <span className="font-mono text-xs text-slate-400">
                  {a.criadoEm.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className="font-medium text-slate-700">{a.acao}</span>
                <span className="text-slate-500">
                  {a.usuario?.nome ?? "—"}
                  {a.detalhe ? ` · ${a.detalhe}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
