"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TIPOS = [
  { v: "FERIAS", r: "Férias" },
  { v: "FOLGA", r: "Folga" },
  { v: "ATESTADO", r: "Atestado" },
  { v: "LICENCA", r: "Licença" },
  { v: "OUTRO", r: "Outro" },
] as const;

export default function FormularioAusencia({
  funcionarios,
  hoje,
}: {
  funcionarios: { id: string; nome: string; matricula: string }[];
  hoje: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [usuarioId, setUsuarioId] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["v"]>("FERIAS");
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(hoje);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch("/api/admin/ausencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId, tipo, inicio, fim, observacao: observacao || null }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(corpo.erro ?? "Não foi possível agendar.");
        return;
      }
      setAberto(false);
      setObservacao("");
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <button type="button" className="botao-primario" onClick={() => setAberto(true)}>
        + Agendar período
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="cartao space-y-3 p-4">
      <h2 className="font-semibold text-slate-800">Agendar período</h2>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label htmlFor="func" className="rotulo">
            Funcionário
          </label>
          <select
            id="func"
            className="campo"
            value={usuarioId}
            onChange={(e) => setUsuarioId(e.target.value)}
            required
          >
            <option value="">Selecione…</option>
            {funcionarios.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome} · mat. {f.matricula}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tipo" className="rotulo">
            Tipo
          </label>
          <select
            id="tipo"
            className="campo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
          >
            {TIPOS.map((t) => (
              <option key={t.v} value={t.v}>
                {t.r}
              </option>
            ))}
          </select>
        </div>
        <div />
        <div>
          <label htmlFor="inicio" className="rotulo">
            Início
          </label>
          <input
            id="inicio"
            type="date"
            className="campo"
            value={inicio}
            onChange={(e) => {
              setInicio(e.target.value);
              // Arrastar o início para depois do fim deixaria o período inválido.
              if (e.target.value > fim) setFim(e.target.value);
            }}
            required
          />
        </div>
        <div>
          <label htmlFor="fim" className="rotulo">
            Fim
          </label>
          <input
            id="fim"
            type="date"
            className="campo"
            value={fim}
            min={inicio}
            onChange={(e) => setFim(e.target.value)}
            required
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="obs" className="rotulo">
            Observação (opcional)
          </label>
          <input
            id="obs"
            className="campo"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: férias referentes a 2025/2026"
          />
        </div>
      </div>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      <p className="text-xs text-slate-500">
        O período nasce <strong>agendado</strong>. Ele só passa a abonar as faltas depois que você
        validar na lista abaixo.
      </p>

      <div className="flex gap-2">
        <button type="submit" className="botao-primario" disabled={enviando || !usuarioId}>
          {enviando ? "Agendando…" : "Agendar"}
        </button>
        <button type="button" className="botao-secundario" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
