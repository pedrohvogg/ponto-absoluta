import type { OrigemRegistro, StatusSolicitacao, TipoRegistro } from "@prisma/client";
import { ROTULO_TIPO } from "@/lib/jornada";

const CORES_TIPO: Record<TipoRegistro, string> = {
  ENTRADA: "bg-emerald-100 text-emerald-800",
  INICIO_INTERVALO: "bg-amber-100 text-amber-800",
  FIM_INTERVALO: "bg-sky-100 text-sky-800",
  SAIDA: "bg-slate-200 text-slate-700",
};

export function EtiquetaTipo({ tipo }: { tipo: TipoRegistro }) {
  return <span className={`etiqueta ${CORES_TIPO[tipo]}`}>{ROTULO_TIPO[tipo]}</span>;
}

const ROTULO_ORIGEM: Record<OrigemRegistro, string> = {
  FACIAL: "Facial",
  MANUAL: "Manual (admin)",
  AJUSTE: "Ajuste aprovado",
};

export function EtiquetaOrigem({ origem }: { origem: OrigemRegistro }) {
  const cor =
    origem === "FACIAL"
      ? "bg-marca-100 text-marca-800"
      : origem === "MANUAL"
        ? "bg-purple-100 text-purple-800"
        : "bg-teal-100 text-teal-800";
  return <span className={`etiqueta ${cor}`}>{ROTULO_ORIGEM[origem]}</span>;
}

export function EtiquetaStatus({ status }: { status: StatusSolicitacao }) {
  const mapa: Record<StatusSolicitacao, string> = {
    PENDENTE: "bg-amber-100 text-amber-800",
    APROVADA: "bg-emerald-100 text-emerald-800",
    REJEITADA: "bg-red-100 text-red-700",
  };
  const rotulo: Record<StatusSolicitacao, string> = {
    PENDENTE: "Pendente",
    APROVADA: "Aprovada",
    REJEITADA: "Rejeitada",
  };
  return <span className={`etiqueta ${mapa[status]}`}>{rotulo[status]}</span>;
}

export function EtiquetaSituacao({
  situacao,
}: {
  situacao: "TRABALHANDO" | "INTERVALO" | "FORA";
}) {
  const mapa = {
    TRABALHANDO: ["bg-emerald-100 text-emerald-800", "Trabalhando"],
    INTERVALO: ["bg-amber-100 text-amber-800", "Em intervalo"],
    FORA: ["bg-slate-200 text-slate-600", "Fora do expediente"],
  } as const;
  const [cor, rotulo] = mapa[situacao];
  return (
    <span className={`etiqueta ${cor}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {rotulo}
    </span>
  );
}
