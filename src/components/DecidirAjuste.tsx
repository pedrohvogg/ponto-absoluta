"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DecidirAjuste({ id }: { id: string }) {
  const router = useRouter();
  const [resposta, setResposta] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function decidir(decisao: "APROVAR" | "REJEITAR") {
    if (decisao === "REJEITAR" && resposta.trim().length === 0) {
      setErro("Explique ao funcionário o motivo da recusa.");
      return;
    }
    setOcupado(decisao);
    setErro(null);
    try {
      const r = await fetch(`/api/admin/ajustes/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao, resposta: resposta.trim() || undefined }),
      });
      const dados = await r.json();
      if (!r.ok) {
        setErro(dados.erro ?? "Não foi possível concluir.");
        return;
      }
      router.refresh();
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="w-full max-w-xs space-y-2">
      <textarea
        rows={2}
        value={resposta}
        onChange={(e) => setResposta(e.target.value)}
        placeholder="Observação para o funcionário (obrigatória ao recusar)"
        className="campo text-sm"
      />
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => decidir("APROVAR")}
          disabled={ocupado !== null}
          className="botao flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {ocupado === "APROVAR" ? "Aplicando…" : "Aprovar"}
        </button>
        <button
          onClick={() => decidir("REJEITAR")}
          disabled={ocupado !== null}
          className="botao-perigo flex-1"
        >
          {ocupado === "REJEITAR" ? "Salvando…" : "Recusar"}
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        Ao aprovar, a batida é aplicada automaticamente no espelho de ponto.
      </p>
    </div>
  );
}
