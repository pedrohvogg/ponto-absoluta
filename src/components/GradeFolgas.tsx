"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { diaBr } from "@/lib/datas";
import { ROTULO_AUSENCIA } from "@/lib/ausencia";
import type { LinhaDeFolgas } from "@/lib/consultas";

const NOMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export default function GradeFolgas({
  semana,
  dias,
  hoje,
  linhas: linhasDoServidor,
}: {
  semana: string;
  dias: string[];
  hoje: string;
  linhas: LinhaDeFolgas[];
}) {
  const router = useRouter();
  const [linhas, setLinhas] = useState(linhasDoServidor);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Trocar de semana (ou o refresh depois de salvar) traz dados novos do servidor.
  useEffect(() => setLinhas(linhasDoServidor), [linhasDoServidor]);

  async function alternar(usuarioId: string, diaSemana: number, folga: boolean) {
    const chave = `${usuarioId}|${diaSemana}`;
    setErro(null);
    setSalvando(chave);
    // Muda na tela antes da resposta: a escala costuma ser montada clicando
    // em sequência, e esperar o servidor a cada toque deixa a grade travada.
    setLinhas((atual) =>
      atual.map((l) =>
        l.id !== usuarioId
          ? l
          : {
              ...l,
              marcadaNestaSemana: true,
              repeteDe: null,
              celulas: l.celulas.map((c) => (c.diaSemana === diaSemana ? { ...c, folga } : c)),
            },
      ),
    );
    try {
      const resposta = await fetch("/api/admin/folgas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId, semana, diaSemana, folga }),
      });
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        setErro(dados.erro ?? "Não foi possível salvar a folga.");
        setLinhas(linhasDoServidor);
        return;
      }
      router.refresh();
    } catch {
      setErro("Falha de conexão. A folga não foi salva.");
      setLinhas(linhasDoServidor);
    } finally {
      setSalvando(null);
    }
  }

  async function repetirAnterior() {
    const certeza = confirm(
      "Desfazer as marcações desta semana?\n\n" +
        "Ela volta a repetir a última semana marcada antes dela.",
    );
    if (!certeza) return;
    setErro(null);
    const resposta = await fetch("/api/admin/folgas", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semana }),
    }).catch(() => null);
    if (!resposta?.ok) {
      setErro("Não foi possível desfazer as marcações da semana.");
      return;
    }
    router.refresh();
  }

  // Quantos trabalham em cada dia: o que o gestor mais precisa conferir ao
  // dar folga é se a loja não fica descoberta.
  const trabalhando = NOMES.map(
    (_, i) => linhas.filter((l) => !l.celulas[i].foraDaEscala && !l.celulas[i].folga && !l.celulas[i].abono).length,
  );
  const algumaMarcada = linhas.some((l) => l.marcadaNestaSemana);

  return (
    <div className="space-y-3">
      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      <div className="cartao overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-semibold">
                Funcionário
              </th>
              {NOMES.map((nome, i) => (
                <th
                  key={nome}
                  className={`px-1 py-2 text-center font-semibold ${
                    dias[i] === hoje ? "text-marca-700" : ""
                  }`}
                >
                  {nome}
                  <span className="block font-normal">{diaBr(dias[i]).slice(0, 5)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="sticky left-0 bg-white px-3 py-2">
                  <p className="font-medium text-slate-900">{l.nome}</p>
                  <p className="text-xs text-slate-400">
                    {l.repeteDe
                      ? `repete a semana de ${diaBr(l.repeteDe).slice(0, 5)}`
                      : l.marcadaNestaSemana
                        ? "marcada nesta semana"
                        : (l.cargo ?? "horário normal")}
                  </p>
                </td>
                {l.celulas.map((c) => {
                  const chave = `${l.id}|${c.diaSemana}`;
                  if (c.foraDaEscala) {
                    return (
                      <td key={c.dia} className="px-1 py-1 text-center">
                        <span
                          className="block rounded-lg bg-slate-100 px-1 py-3 text-xs text-slate-400"
                          title="O horário fixo deste funcionário já não prevê trabalho neste dia."
                        >
                          não trabalha
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td key={c.dia} className="px-1 py-1 text-center">
                      <button
                        type="button"
                        disabled={salvando === chave}
                        onClick={() => alternar(l.id, c.diaSemana, !c.folga)}
                        aria-pressed={c.folga}
                        aria-label={`${l.nome}, ${NOMES[(c.diaSemana + 6) % 7]}: ${
                          c.folga ? "folga — tocar para tirar" : "trabalha — tocar para dar folga"
                        }`}
                        className={`block w-full rounded-lg px-1 py-3 text-xs font-medium transition disabled:opacity-60 ${
                          c.folga
                            ? "bg-amber-400 text-amber-950 hover:bg-amber-300"
                            : "bg-white text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-marca-50"
                        }`}
                      >
                        {c.folga ? "FOLGA" : `${c.entrada}–${c.saida}`}
                        {c.abono && (
                          <span className="mt-0.5 block text-[10px] font-semibold text-emerald-700">
                            {ROTULO_AUSENCIA[c.abono]}
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 text-xs text-slate-600">
              <td className="sticky left-0 bg-slate-50 px-3 py-2 font-semibold">Trabalhando</td>
              {trabalhando.map((n, i) => (
                <td
                  key={i}
                  className={`px-1 py-2 text-center font-semibold tabular-nums ${
                    n === 0 ? "text-red-600" : ""
                  }`}
                >
                  {n}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <p>
          <span className="mr-1 inline-block h-3 w-3 rounded bg-amber-400 align-middle" /> folga
          desta semana ·{" "}
          <span className="mx-1 inline-block h-3 w-3 rounded bg-slate-100 align-middle ring-1 ring-slate-300" /> fora do
          horário fixo (muda na ficha do funcionário)
        </p>
        {algumaMarcada && (
          <button type="button" onClick={repetirAnterior} className="text-slate-500 underline">
            Desfazer esta semana e repetir a anterior
          </button>
        )}
      </div>
    </div>
  );
}
