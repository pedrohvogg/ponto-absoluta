"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TipoRegistro } from "@prisma/client";
import { ROTULO_TIPO } from "@/lib/jornada";

type RegistroResumo = { id: string; dia: string; tipo: TipoRegistro; hora: string };

const TIPOS: TipoRegistro[] = ["ENTRADA", "INICIO_INTERVALO", "FIM_INTERVALO", "SAIDA"];

export default function SolicitarAjuste({
  registros,
  hoje,
}: {
  registros: RegistroResumo[];
  hoje: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [acao, setAcao] = useState<"INCLUIR" | "ALTERAR" | "EXCLUIR">("INCLUIR");
  const [dia, setDia] = useState(hoje);
  const [tipo, setTipo] = useState<TipoRegistro>("ENTRADA");
  const [horario, setHorario] = useState("");
  const [registroAlvoId, setRegistroAlvoId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const precisaAlvo = acao !== "INCLUIR";

  function selecionarAlvo(id: string) {
    setRegistroAlvoId(id);
    const alvo = registros.find((r) => r.id === id);
    if (alvo) {
      setDia(alvo.dia);
      setTipo(alvo.tipo);
      if (acao === "ALTERAR") setHorario(alvo.hora);
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(false);
    setEnviando(true);
    try {
      const resposta = await fetch("/api/solicitacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao,
          dia,
          tipo,
          horario: acao === "EXCLUIR" ? null : horario,
          registroAlvoId: precisaAlvo ? registroAlvoId : null,
          motivo,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível enviar a solicitação.");
        return;
      }
      setOk(true);
      setMotivo("");
      setHorario("");
      setRegistroAlvoId("");
      router.refresh();
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="botao-secundario w-full">
        ✏️ Solicitar ajuste de ponto
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="cartao space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Solicitar ajuste</h2>
        <button type="button" onClick={() => setAberto(false)} className="text-sm text-slate-500">
          fechar
        </button>
      </div>
      <p className="text-xs text-slate-500">
        O pedido vai para a análise do RH. Você recebe a resposta nesta mesma página.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="acao" className="rotulo text-xs">
            O que você precisa
          </label>
          <select
            id="acao"
            className="campo py-1.5"
            value={acao}
            onChange={(e) => {
              setAcao(e.target.value as typeof acao);
              setRegistroAlvoId("");
            }}
          >
            <option value="INCLUIR">Incluir uma batida que faltou</option>
            <option value="ALTERAR">Corrigir o horário de uma batida</option>
            <option value="EXCLUIR">Excluir uma batida indevida</option>
          </select>
        </div>

        {precisaAlvo ? (
          <div>
            <label htmlFor="alvo" className="rotulo text-xs">
              Qual batida
            </label>
            <select
              id="alvo"
              className="campo py-1.5"
              required
              value={registroAlvoId}
              onChange={(e) => selecionarAlvo(e.target.value)}
            >
              <option value="">Selecione…</option>
              {registros.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.dia.split("-").reverse().join("/")} · {r.hora} · {ROTULO_TIPO[r.tipo]}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="dia-ajuste" className="rotulo text-xs">
              Dia
            </label>
            <input
              id="dia-ajuste"
              type="date"
              max={hoje}
              className="campo py-1.5"
              required
              value={dia}
              onChange={(e) => setDia(e.target.value)}
            />
          </div>
        )}

        <div>
          <label htmlFor="tipo-ajuste" className="rotulo text-xs">
            Tipo de batida
          </label>
          <select
            id="tipo-ajuste"
            className="campo py-1.5"
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

        {acao !== "EXCLUIR" && (
          <div>
            <label htmlFor="hora-ajuste" className="rotulo text-xs">
              Horário correto
            </label>
            <input
              id="hora-ajuste"
              type="time"
              className="campo py-1.5"
              required
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
            />
          </div>
        )}

        <div className="md:col-span-2">
          <label htmlFor="motivo" className="rotulo text-xs">
            Motivo (mínimo 10 caracteres)
          </label>
          <textarea
            id="motivo"
            rows={2}
            className="campo"
            required
            minLength={10}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="ex.: esqueci de bater a saída porque atendi um cliente até 18h30"
          />
        </div>
      </div>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {ok && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Solicitação enviada. Aguarde a análise do RH.
        </p>
      )}

      <button type="submit" className="botao-primario" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviar solicitação"}
      </button>
    </form>
  );
}
