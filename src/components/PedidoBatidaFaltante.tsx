"use client";

import { useState } from "react";
import type { TipoRegistro } from "@prisma/client";
import { listarTipos, ROTULO_TIPO } from "@/lib/jornada";

/**
 * Pedido da batida que a pessoa acabou de pular, aberto logo depois do
 * registro fora de ordem. Vai pelo mesmo caminho de qualquer solicitação de
 * ajuste: o responsável analisa, e a hora só entra quando ele aprovar.
 */
export default function PedidoBatidaFaltante({
  dia,
  faltando,
  escala,
}: {
  dia: string;
  faltando: TipoRegistro[];
  escala: { entrada: string; saida: string };
}) {
  const [restam, setRestam] = useState(faltando);
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoRegistro>(faltando[0]);
  const [horario, setHorario] = useState(sugerir(faltando[0], escala));
  const [motivo, setMotivo] = useState("Esqueci de registrar o ponto nesse horário.");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviados, setEnviados] = useState<TipoRegistro[]>([]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await fetch("/api/solicitacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "INCLUIR", dia, tipo, horario, motivo }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível enviar o pedido.");
        return;
      }
      const proximas = restam.filter((t) => t !== tipo);
      setEnviados((atual) => [...atual, tipo]);
      setRestam(proximas);
      if (proximas.length > 0) {
        setTipo(proximas[0]);
        setHorario(sugerir(proximas[0], escala));
      } else {
        setAberto(false);
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setEnviando(false);
    }
  }

  if (restam.length === 0) {
    return (
      <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-sm text-emerald-800">
        Pedido de ajuste enviado ({listarTipos(enviados)}). O responsável vai analisar.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left">
      <p className="text-sm font-semibold text-amber-900">
        Faltou registrar {listarTipos(restam)} hoje.
      </p>
      {!aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="botao-primario mt-2 w-full"
        >
          Pedir ajuste agora
        </button>
      ) : (
        <form onSubmit={enviar} className="mt-2 space-y-2">
          {restam.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {restam.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTipo(t);
                    setHorario(sugerir(t, escala));
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    tipo === t
                      ? "border-marca-500 bg-marca-50 text-marca-900"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {ROTULO_TIPO[t]}
                </button>
              ))}
            </div>
          )}
          <label className="block text-sm text-slate-700">
            Horário da {ROTULO_TIPO[tipo].toLowerCase()}
            <input
              type="time"
              required
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
              className="campo mt-1"
            />
          </label>
          <label className="block text-sm text-slate-700">
            Motivo
            <input
              required
              minLength={10}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="campo mt-1"
            />
          </label>
          {erro && <p className="text-sm text-red-700">{erro}</p>}
          <button type="submit" disabled={enviando} className="botao-primario w-full">
            {enviando ? "Enviando…" : `Pedir ajuste da ${ROTULO_TIPO[tipo].toLowerCase()}`}
          </button>
        </form>
      )}
    </div>
  );
}

/** Entrada e saída têm hora na escala; o intervalo fica para a pessoa dizer. */
function sugerir(tipo: TipoRegistro, escala: { entrada: string; saida: string }): string {
  if (tipo === "ENTRADA") return escala.entrada;
  if (tipo === "SAIDA") return escala.saida;
  return "";
}
