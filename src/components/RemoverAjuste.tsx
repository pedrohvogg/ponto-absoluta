"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Remove uma solicitação ainda em aberto.
 *
 * Separado de DecidirAjuste porque serve a dois estados diferentes: o pedido do
 * funcionário que o administrador quer descartar, e a proposta lançada por
 * engano que está esperando um de-acordo. Decidir e apagar são ações distintas,
 * e misturá-las no mesmo bloco convidaria a clicar em "recusar" quando a
 * intenção era desfazer o próprio erro.
 */
export default function RemoverAjuste({
  id,
  aguardandoFuncionario,
}: {
  id: string;
  aguardandoFuncionario: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function remover() {
    const aviso = aguardandoFuncionario
      ? "Remover esta proposta?\n\nEla deixa de aparecer para o funcionário no próximo registro."
      : "Remover esta solicitação?\n\nO pedido some sem virar aprovação nem recusa.";
    if (!confirm(aviso)) return;
    setErro(null);
    setOcupado(true);
    try {
      const r = await fetch(`/api/admin/ajustes/${id}`, { method: "DELETE" });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(dados.erro ?? "Não foi possível remover.");
        return;
      }
      router.refresh();
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mt-2 text-right">
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      <button
        type="button"
        onClick={remover}
        disabled={ocupado}
        className="text-xs text-slate-500 underline hover:text-red-600 disabled:opacity-50"
      >
        {ocupado ? "Removendo…" : "Remover solicitação"}
      </button>
    </div>
  );
}
