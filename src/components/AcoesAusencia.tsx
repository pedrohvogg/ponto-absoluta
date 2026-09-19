"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Validar, cancelar ou remover um período de ausência. */
export default function AcoesAusencia({
  id,
  status,
}: {
  id: string;
  status: "AGENDADA" | "VALIDADA" | "CANCELADA";
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function chamar(metodo: "POST" | "DELETE", corpo?: unknown, confirmacao?: string) {
    if (confirmacao && !confirm(confirmacao)) return;
    setErro(null);
    setOcupado(true);
    try {
      const r = await fetch(`/api/admin/ausencias/${id}`, {
        method: metodo,
        headers: corpo ? { "Content-Type": "application/json" } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const resposta = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(resposta.erro ?? "Não foi possível concluir.");
        return;
      }
      router.refresh();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {erro && <span className="text-xs text-red-600">{erro}</span>}
      {status === "AGENDADA" && (
        <>
          <button
            type="button"
            className="botao-primario text-xs"
            disabled={ocupado}
            onClick={() =>
              chamar(
                "POST",
                { decisao: "VALIDAR" },
                "Validar este período?\n\nOs dias passam a ser abonados: deixam de cobrar jornada e de contar como falta.",
              )
            }
          >
            Validar
          </button>
          <button
            type="button"
            className="botao-secundario text-xs"
            disabled={ocupado}
            onClick={() => chamar("DELETE", undefined, "Remover este período agendado?")}
          >
            Remover
          </button>
        </>
      )}
      {status === "VALIDADA" && (
        <button
          type="button"
          className="botao-secundario text-xs"
          disabled={ocupado}
          onClick={() =>
            chamar(
              "POST",
              { decisao: "CANCELAR" },
              "Cancelar este período?\n\nOs dias voltam a cobrar jornada e podem virar falta no relatório.",
            )
          }
        >
          Cancelar
        </button>
      )}
      {status === "CANCELADA" && <span className="text-xs text-slate-400">—</span>}
    </div>
  );
}
