"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TipoRegistro } from "@prisma/client";
import { ROTULO_TIPO } from "@/lib/jornada";

const TIPOS: TipoRegistro[] = ["ENTRADA", "INICIO_INTERVALO", "FIM_INTERVALO", "SAIDA"];

/**
 * Ajuste proposto pelo administrador.
 *
 * Só cria a proposta: a batida entra no espelho quando o funcionário confirmar,
 * no próximo registro dele (pelo app ou no totem). Para lançar direto, sem
 * passar por ele, existe o lançamento manual na tela de Registros.
 */
export default function ProporAjuste({
  funcionarios,
  hoje,
}: {
  funcionarios: { id: string; nome: string; matricula: string }[];
  hoje: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [usuarioId, setUsuarioId] = useState("");
  const [dia, setDia] = useState(hoje);
  const [tipo, setTipo] = useState<TipoRegistro>("ENTRADA");
  const [horario, setHorario] = useState("08:00");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch("/api/admin/ajustes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId, acao: "INCLUIR", dia, tipo, horario, motivo }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(corpo.erro ?? "Não foi possível propor o ajuste.");
        return;
      }
      setAberto(false);
      setMotivo("");
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
        + Propor ajuste a um funcionário
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="cartao space-y-3 p-4">
      <h2 className="font-semibold text-slate-800">Propor ajuste</h2>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label htmlFor="pa-func" className="rotulo">
            Funcionário
          </label>
          <select
            id="pa-func"
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
          <label htmlFor="pa-dia" className="rotulo">
            Dia
          </label>
          <input
            id="pa-dia"
            type="date"
            className="campo"
            value={dia}
            max={hoje}
            onChange={(e) => setDia(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="pa-tipo" className="rotulo">
            Batida
          </label>
          <select
            id="pa-tipo"
            className="campo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoRegistro)}
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pa-hora" className="rotulo">
            Horário
          </label>
          <input
            id="pa-hora"
            type="time"
            className="campo"
            value={horario}
            onChange={(e) => setHorario(e.target.value)}
            required
          />
        </div>
        <div className="md:col-span-3">
          <label htmlFor="pa-motivo" className="rotulo">
            Motivo (o funcionário vai ler)
          </label>
          <input
            id="pa-motivo"
            className="campo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: esqueceu de bater a entrada, confirmado pela supervisora"
            required
            minLength={10}
          />
        </div>
      </div>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      <p className="text-xs text-slate-500">
        A batida <strong>não</strong> entra agora: ela aparece para o funcionário no próximo
        registro, e só é gravada se ele confirmar.
      </p>

      <div className="flex gap-2">
        <button type="submit" className="botao-primario" disabled={enviando || !usuarioId}>
          {enviando ? "Enviando…" : "Propor"}
        </button>
        <button type="button" className="botao-secundario" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
