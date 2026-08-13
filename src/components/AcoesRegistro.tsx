"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TipoRegistro } from "@prisma/client";
import { ROTULO_TIPO } from "@/lib/jornada";

const TIPOS: TipoRegistro[] = ["ENTRADA", "INICIO_INTERVALO", "FIM_INTERVALO", "SAIDA"];

export default function AcoesRegistro({
  id,
  hora,
  tipo,
}: {
  id: string;
  hora: string;
  tipo: TipoRegistro;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [novaHora, setNovaHora] = useState(hora);
  const [novoTipo, setNovoTipo] = useState<TipoRegistro>(tipo);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function salvar() {
    if (observacao.trim().length < 3) {
      setErro("Descreva o motivo da alteração.");
      return;
    }
    setOcupado(true);
    setErro(null);
    const resposta = await fetch(`/api/admin/registros/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hora: novaHora, tipo: novoTipo, observacao }),
    });
    const dados = await resposta.json();
    setOcupado(false);
    if (!resposta.ok) {
      setErro(dados.erro ?? "Não foi possível salvar.");
      return;
    }
    setEditando(false);
    router.refresh();
  }

  async function excluir() {
    if (!confirm("Excluir este registro? A ação fica na auditoria.")) return;
    setOcupado(true);
    const resposta = await fetch(`/api/admin/registros/${id}`, { method: "DELETE" });
    setOcupado(false);
    if (resposta.ok) router.refresh();
    else setErro("Não foi possível excluir.");
  }

  if (!editando) {
    return (
      <div className="flex justify-end gap-2 whitespace-nowrap">
        <button onClick={() => setEditando(true)} className="text-xs text-marca-700 hover:underline">
          editar
        </button>
        <button onClick={excluir} disabled={ocupado} className="text-xs text-red-600 hover:underline">
          excluir
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-[220px] space-y-1 text-left">
      <div className="flex gap-1">
        <input
          type="time"
          value={novaHora}
          onChange={(e) => setNovaHora(e.target.value)}
          className="campo px-2 py-1 text-xs"
        />
        <select
          value={novoTipo}
          onChange={(e) => setNovoTipo(e.target.value as TipoRegistro)}
          className="campo px-2 py-1 text-xs"
        >
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO[t]}
            </option>
          ))}
        </select>
      </div>
      <input
        placeholder="motivo da alteração"
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        className="campo px-2 py-1 text-xs"
      />
      {erro && <p className="text-[11px] text-red-600">{erro}</p>}
      <div className="flex gap-2">
        <button onClick={salvar} disabled={ocupado} className="text-xs font-medium text-marca-700">
          salvar
        </button>
        <button onClick={() => setEditando(false)} className="text-xs text-slate-500">
          cancelar
        </button>
      </div>
    </div>
  );
}
