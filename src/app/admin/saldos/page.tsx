import Link from "next/link";
import { exigirAdmin } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { saldosDoPeriodo } from "@/lib/consultas";
import { diaBr, hojeStr, limitesDoMes, minutosParaHoras } from "@/lib/datas";
import { DIA_REGEX } from "@/lib/validacao";

export const dynamic = "force-dynamic";

type Busca = { de?: string; ate?: string; ordem?: string; inativos?: string };

/**
 * Painel de horas: o saldo de cada funcionário no período, lado a lado.
 *
 * O espelho de ponto responde "como foi o mês do fulano"; esta tela responde
 * "quem está com saldo para resolver", que é a pergunta de quem administra.
 */
export default async function PaginaSaldos({
  searchParams,
}: {
  searchParams: Promise<Busca>;
}) {
  await exigirAdmin();
  const config = await obterConfig();
  const hoje = hojeStr(config.fusoHorario);
  const mes = limitesDoMes(hoje);

  const q = await searchParams;
  const de = valido(q.de) ?? mes.de;
  const ate = valido(q.ate) ?? mes.ate;
  const ordem = q.ordem === "saldo" || q.ordem === "pendencias" ? q.ordem : "nome";
  const inativos = q.inativos === "1";

  const { linhas, ate: ateEfetivo } = await saldosDoPeriodo(de, ate, inativos);

  const ordenadas = [...linhas].sort((a, b) => {
    if (ordem === "saldo") return a.total.saldo - b.total.saldo;
    if (ordem === "pendencias") {
      const peso = (l: (typeof linhas)[number]) => l.total.pendentes + l.ajustesAbertos;
      return peso(b) - peso(a);
    }
    return a.funcionario.nome.localeCompare(b.funcionario.nome, "pt-BR");
  });

  const geral = linhas.reduce(
    (acc, l) => ({
      saldo: acc.saldo + l.total.saldo,
      extras: acc.extras + l.total.extras,
      devendo: acc.devendo + l.total.devendo,
      pendentes: acc.pendentes + l.total.pendentes,
      faltas: acc.faltas + l.total.faltas,
    }),
    { saldo: 0, extras: 0, devendo: 0, pendentes: 0, faltas: 0 },
  );

  return (
    <div className="space-y-5">
      <div className="nao-imprimir">
        <h1 className="text-xl font-bold text-slate-900">Monitor de horas</h1>
        <p className="text-sm text-slate-500">
          Saldo de cada funcionário no período. Período considerado: {diaBr(de)} a{" "}
          {diaBr(ateEfetivo)} — dias futuros ficam de fora para não virarem débito.
        </p>
      </div>

      <form className="cartao nao-imprimir flex flex-wrap items-end gap-3 p-4">
        <div>
          <label htmlFor="de" className="rotulo text-xs">
            De
          </label>
          <input id="de" type="date" name="de" defaultValue={de} className="campo py-1.5" />
        </div>
        <div>
          <label htmlFor="ate" className="rotulo text-xs">
            Até
          </label>
          <input id="ate" type="date" name="ate" defaultValue={ate} className="campo py-1.5" />
        </div>
        <div>
          <label htmlFor="ordem" className="rotulo text-xs">
            Ordenar por
          </label>
          <select id="ordem" name="ordem" defaultValue={ordem} className="campo py-1.5">
            <option value="nome">Nome</option>
            <option value="saldo">Saldo (mais negativo primeiro)</option>
            <option value="pendencias">Pendências</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" name="inativos" value="1" defaultChecked={inativos} />
          incluir inativos
        </label>
        <button className="botao-primario py-2">Atualizar</button>
        <Link href={`/api/relatorios/csv?de=${de}&ate=${ate}`} className="botao-secundario py-2">
          ⬇ CSV do período
        </Link>
      </form>

      <div className="grid gap-3 sm:grid-cols-4">
        <Resumo titulo="Saldo da equipe" valor={minutosParaHoras(geral.saldo)} destaque={geral.saldo >= 0 ? "positivo" : "negativo"} />
        <Resumo titulo="Extras acumuladas" valor={minutosParaHoras(geral.extras)} />
        <Resumo titulo="Débito acumulado" valor={minutosParaHoras(geral.devendo)} />
        <Resumo
          titulo="Dias a regularizar"
          valor={String(geral.pendentes)}
          destaque={geral.pendentes > 0 ? "atencao" : undefined}
        />
      </div>

      <div className="cartao overflow-hidden">
        {ordenadas.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            Nenhum funcionário no período selecionado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Funcionário</th>
                  <th className="px-4 py-2 text-right">Trabalhado</th>
                  <th className="px-4 py-2 text-right">Previsto</th>
                  <th className="px-4 py-2 text-right">Saldo</th>
                  <th className="px-4 py-2 text-right">Extras</th>
                  <th className="px-4 py-2 text-right">Débito</th>
                  <th className="px-4 py-2 text-center">Faltas</th>
                  <th className="px-4 py-2 text-center">Abonos</th>
                  <th className="px-4 py-2 text-center">A resolver</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ordenadas.map(({ funcionario, total, ajustesAbertos }) => {
                  const aResolver = total.pendentes + ajustesAbertos;
                  return (
                    <tr key={funcionario.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <p className="font-medium text-slate-800">
                          {funcionario.nome}
                          {!funcionario.ativo && (
                            <span className="ml-2 etiqueta bg-slate-200 text-slate-600">
                              inativo
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">
                          {funcionario.cargo ? `${funcionario.cargo} · ` : ""}mat.{" "}
                          {funcionario.matricula}
                        </p>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {minutosParaHoras(total.trabalhado)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                        {minutosParaHoras(total.previsto)}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-semibold tabular-nums ${
                          total.saldo >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {minutosParaHoras(total.saldo)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-emerald-700">
                        {minutosParaHoras(total.extras)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-red-700">
                        {minutosParaHoras(total.devendo)}
                      </td>
                      <td className="px-4 py-2 text-center tabular-nums">
                        {total.faltas > 0 ? total.faltas : "—"}
                      </td>
                      <td className="px-4 py-2 text-center tabular-nums text-slate-500">
                        {total.abonados > 0 ? total.abonados : "—"}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {aResolver > 0 ? (
                          <span className="etiqueta bg-amber-100 text-amber-800">{aResolver}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/admin/relatorios?funcionarioId=${funcionario.id}&de=${de}&ate=${ate}`}
                          className="text-xs font-medium text-marca-700 hover:underline"
                        >
                          Espelho →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        “A resolver” soma os dias sem ponto completo e os pedidos de ajuste em aberto. Dias cobertos
        por férias ou folga validadas aparecem em “Abonos” e não entram como falta.
      </p>
    </div>
  );
}

function Resumo({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: string;
  destaque?: "positivo" | "negativo" | "atencao";
}) {
  const cor =
    destaque === "positivo"
      ? "text-emerald-600"
      : destaque === "negativo"
        ? "text-red-600"
        : destaque === "atencao"
          ? "text-amber-600"
          : "text-slate-900";
  return (
    <div className="cartao p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${cor}`}>{valor}</p>
    </div>
  );
}

function valido(v: string | undefined): string | null {
  return v && DIA_REGEX.test(v) ? v : null;
}
