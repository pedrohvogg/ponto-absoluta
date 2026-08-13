"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TipoRegistro } from "@prisma/client";
import { ROTULO_TIPO } from "@/lib/jornada";

const TIPOS: TipoRegistro[] = ["ENTRADA", "INICIO_INTERVALO", "FIM_INTERVALO", "SAIDA"];

export default function LancamentoManual({
  funcionarios,
}: {
  funcionarios: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setEnviando(true);
    setErro(null);
    setOk(false);
    try {
      const resposta = await fetch("/api/admin/registros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuarioId: form.get("usuarioId"),
          dia: form.get("dia"),
          hora: form.get("hora"),
          tipo: form.get("tipo"),
          observacao: form.get("observacao"),
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível lançar o registro.");
        return;
      }
      setOk(true);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="botao-secundario">
        + Lançar ponto manualmente
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="cartao space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Lançamento manual</h2>
        <button type="button" onClick={() => setAberto(false)} className="text-sm text-slate-500">
          fechar
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Use para corrigir esquecimentos ou falhas de equipamento. O lançamento fica marcado como
        “manual” e registrado na auditoria com o seu nome.
      </p>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label htmlFor="usuarioId" className="rotulo text-xs">
            Funcionário
          </label>
          <select id="usuarioId" name="usuarioId" required className="campo py-1.5">
            <option value="">Selecione…</option>
            {funcionarios.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dia-manual" className="rotulo text-xs">
            Data
          </label>
          <input id="dia-manual" type="date" name="dia" required className="campo py-1.5" />
        </div>
        <div>
          <label htmlFor="hora-manual" className="rotulo text-xs">
            Hora
          </label>
          <input id="hora-manual" type="time" name="hora" required className="campo py-1.5" />
        </div>
        <div>
          <label htmlFor="tipo-manual" className="rotulo text-xs">
            Tipo
          </label>
          <select id="tipo-manual" name="tipo" required className="campo py-1.5">
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-3">
          <label htmlFor="obs-manual" className="rotulo text-xs">
            Motivo (obrigatório)
          </label>
          <input
            id="obs-manual"
            name="observacao"
            required
            minLength={3}
            placeholder="ex.: funcionário esqueceu de bater a saída"
            className="campo py-1.5"
          />
        </div>
      </div>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {ok && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Registro lançado.
        </p>
      )}

      <button type="submit" className="botao-primario" disabled={enviando}>
        {enviando ? "Lançando…" : "Lançar registro"}
      </button>
    </form>
  );
}
