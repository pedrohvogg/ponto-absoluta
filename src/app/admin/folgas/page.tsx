import Link from "next/link";
import { exigirAdmin } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { gradeDeFolgas } from "@/lib/consultas";
import { diaBr, hojeStr, somaDias } from "@/lib/datas";
import { segundaDaSemana } from "@/lib/folgas";
import { DIA_REGEX } from "@/lib/validacao";
import GradeFolgas from "@/components/GradeFolgas";

export const dynamic = "force-dynamic";

export default async function PaginaFolgas({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  await exigirAdmin();
  const config = await obterConfig();
  const hoje = hojeStr(config.fusoHorario);
  const { semana: pedida } = await searchParams;

  // Qualquer data da semana serve no endereço; a grade sempre abre na segunda.
  const segunda = segundaDaSemana(pedida && DIA_REGEX.test(pedida) ? pedida : hoje);
  const estaSemana = segundaDaSemana(hoje);
  const { dias, linhas } = await gradeDeFolgas(segunda);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Folgas da semana</h1>
        <p className="text-sm text-slate-500">
          Toque no dia para dar ou tirar a folga. Nos outros dias vale o horário normal de cada
          funcionário. Uma semana que ninguém marcou repete a última semana marcada antes dela.
        </p>
      </div>

      <div className="cartao grid grid-cols-[auto_1fr_auto] items-center gap-2 p-3">
        <Link
          href={`/admin/folgas?semana=${somaDias(segunda, -7)}`}
          className="botao-secundario px-3 py-1.5"
          aria-label="Semana anterior"
        >
          ◀<span className="hidden sm:inline"> Anterior</span>
        </Link>
        <div className="text-center">
          <p className="font-semibold text-slate-900">
            {diaBr(dias[0])} a {diaBr(dias[6])}
          </p>
          {segunda !== estaSemana && (
            <Link href="/admin/folgas" className="text-xs text-marca-700 underline">
              voltar para esta semana
            </Link>
          )}
        </div>
        <Link
          href={`/admin/folgas?semana=${somaDias(segunda, 7)}`}
          className="botao-secundario px-3 py-1.5"
          aria-label="Próxima semana"
        >
          <span className="hidden sm:inline">Próxima </span>▶
        </Link>
      </div>

      {linhas.length === 0 ? (
        <div className="cartao p-8 text-center text-slate-500">
          Nenhum funcionário ativo cadastrado.
        </div>
      ) : (
        <GradeFolgas semana={segunda} dias={dias} hoje={hoje} linhas={linhas} />
      )}
    </div>
  );
}
