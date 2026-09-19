"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TipoRegistro } from "@prisma/client";
import { ROTULO_TIPO } from "@/lib/jornada";

export type PropostaAberta = {
  id: string;
  dia: string;
  diaBr: string;
  acao: "INCLUIR" | "ALTERAR" | "EXCLUIR";
  tipo: TipoRegistro;
  horario: string | null;
  motivo: string;
  propostaPor: string | null;
};

export type DiaEmAberto = {
  dia: string;
  diaBr: string;
  diaSemana: string;
  motivo: "SEM_REGISTRO" | "INCOMPLETO";
  entradaPrevista: string;
  saidaPrevista: string;
  batidas: { tipo: string; hora: string }[];
  jaSolicitado: boolean;
};

const TIPOS: TipoRegistro[] = ["ENTRADA", "INICIO_INTERVALO", "FIM_INTERVALO", "SAIDA"];

/**
 * Alerta de pendencias mostrado antes de bater o ponto.
 *
 * Duas conversas diferentes cabem aqui, e a ordem importa: primeiro o que o
 * administrador propos e espera resposta (o funcionario precisa saber que
 * mexeram no ponto dele), depois os dias que ele mesmo deixou em aberto.
 */
export default function AlertaPendencias({
  propostas,
  dias,
}: {
  propostas: PropostaAberta[];
  dias: DiaEmAberto[];
}) {
  if (propostas.length === 0 && dias.length === 0) return null;

  return (
    <div className="space-y-3">
      {propostas.map((p) => (
        <CartaoProposta key={p.id} proposta={p} />
      ))}
      {dias.length > 0 && <CartaoDiasEmAberto dias={dias} />}
    </div>
  );
}

function CartaoProposta({ proposta }: { proposta: PropostaAberta }) {
  const router = useRouter();
  const [recusando, setRecusando] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function decidir(decisao: "CONFIRMAR" | "RECUSAR") {
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch(`/api/solicitacoes/${proposta.id}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao, observacao: observacao || undefined }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(corpo.erro ?? "Não foi possível registrar sua resposta.");
        return;
      }
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  const descricao =
    proposta.acao === "EXCLUIR"
      ? `excluir a batida de ${ROTULO_TIPO[proposta.tipo].toLowerCase()}`
      : proposta.acao === "ALTERAR"
        ? `mudar a ${ROTULO_TIPO[proposta.tipo].toLowerCase()} para ${proposta.horario}`
        : `incluir ${ROTULO_TIPO[proposta.tipo].toLowerCase()} às ${proposta.horario}`;

  return (
    <div className="cartao border-sky-200 bg-sky-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
        Ajuste aguardando sua confirmação
      </p>
      <p className="mt-1 text-sm text-sky-900">
        {proposta.propostaPor ? <strong>{proposta.propostaPor}</strong> : "O responsável"} quer{" "}
        {descricao} em <strong>{proposta.diaBr}</strong>.
      </p>
      <p className="mt-1 text-sm italic text-sky-800">“{proposta.motivo}”</p>

      {erro && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {recusando ? (
        <div className="mt-3 space-y-2">
          <textarea
            className="campo"
            rows={2}
            placeholder="Por que você não concorda?"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="botao-primario"
              disabled={enviando || observacao.trim().length === 0}
              onClick={() => decidir("RECUSAR")}
            >
              Enviar recusa
            </button>
            <button type="button" className="botao-secundario" onClick={() => setRecusando(false)}>
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="botao-primario"
            disabled={enviando}
            onClick={() => decidir("CONFIRMAR")}
          >
            {enviando ? "Registrando…" : "Confirmo, está correto"}
          </button>
          <button type="button" className="botao-secundario" onClick={() => setRecusando(true)}>
            Não concordo
          </button>
        </div>
      )}
    </div>
  );
}

function CartaoDiasEmAberto({ dias }: { dias: DiaEmAberto[] }) {
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const aResolver = dias.filter((d) => !d.jaSolicitado);

  return (
    <div className="cartao border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
        {dias.length === 1 ? "1 dia sem ponto completo" : `${dias.length} dias sem ponto completo`}
      </p>
      <p className="mt-1 text-sm text-amber-900">
        {aResolver.length > 0
          ? "Regularize antes que vire desconto no fechamento do mês."
          : "Os pedidos já foram enviados e estão em análise."}
      </p>

      <ul className="mt-3 space-y-2">
        {dias.map((d) => (
          <li key={d.dia} className="rounded-lg border border-amber-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {d.diaBr} <span className="font-normal text-slate-500">({d.diaSemana})</span>
                </p>
                <p className="text-xs text-slate-500">
                  {d.motivo === "SEM_REGISTRO"
                    ? `Nenhuma batida. Previsto ${d.entradaPrevista}–${d.saidaPrevista}.`
                    : `Registrado: ${d.batidas.map((b) => b.hora).join(", ")} — falta entrada ou saída.`}
                </p>
              </div>
              {d.jaSolicitado ? (
                <span className="etiqueta bg-slate-200 text-slate-600">Em análise</span>
              ) : (
                <button
                  type="button"
                  className="botao-secundario text-xs"
                  onClick={() => setAbertoEm(abertoEm === d.dia ? null : d.dia)}
                >
                  {abertoEm === d.dia ? "Fechar" : "Solicitar ajuste"}
                </button>
              )}
            </div>
            {abertoEm === d.dia && <FormularioAjusteRapido dia={d} aoEnviar={() => setAbertoEm(null)} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormularioAjusteRapido({ dia, aoEnviar }: { dia: DiaEmAberto; aoEnviar: () => void }) {
  const router = useRouter();
  // Sem batida nenhuma o caso quase sempre é a entrada; com batida solta,
  // costuma ser a saída que ficou faltando.
  const [tipo, setTipo] = useState<TipoRegistro>(
    dia.motivo === "SEM_REGISTRO" ? "ENTRADA" : "SAIDA",
  );
  const [horario, setHorario] = useState(
    dia.motivo === "SEM_REGISTRO" ? dia.entradaPrevista : dia.saidaPrevista,
  );
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch("/api/solicitacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "INCLUIR", dia: dia.dia, tipo, horario, motivo }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(corpo.erro ?? "Não foi possível enviar o pedido.");
        return;
      }
      aoEnviar();
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mt-3 space-y-2 border-t border-slate-200 pt-3">
      <div className="flex flex-wrap gap-2">
        <select
          className="campo py-1.5 text-sm"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoRegistro)}
        >
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO[t]}
            </option>
          ))}
        </select>
        <input
          type="time"
          className="campo w-32 py-1.5 text-sm"
          value={horario}
          onChange={(e) => setHorario(e.target.value)}
          required
        />
      </div>
      <textarea
        className="campo text-sm"
        rows={2}
        placeholder="O que aconteceu nesse dia? (mínimo 10 caracteres)"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        required
      />
      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      <button type="submit" className="botao-primario text-sm" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviar pedido"}
      </button>
    </form>
  );
}
