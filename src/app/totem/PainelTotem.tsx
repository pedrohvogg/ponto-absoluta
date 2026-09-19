"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TipoRegistro } from "@prisma/client";
import CameraFacial, { type ResultadoCaptura } from "@/components/CameraFacial";
import { ROTULO_TIPO } from "@/lib/jornada";
import type { SecaoTermo } from "@/lib/termoUso";

type Pessoa = {
  nome: string;
  primeiroNome: string;
  matricula: string;
  cargo: string | null;
};

type Batida = { tipo: TipoRegistro; rotulo: string; hora: string };

/** Ajuste lançado pelo administrador que espera o de-acordo desta pessoa. */
type PropostaTotem = {
  id: string;
  dia: string;
  acao: "INCLUIR" | "ALTERAR" | "EXCLUIR";
  rotuloTipo: string;
  horario: string | null;
  motivo: string;
  propostaPor: string | null;
};

type Estado =
  | { tela: "ocioso" }
  | { tela: "processando" }
  | { tela: "termo"; pessoa: Pessoa }
  | { tela: "confirmar"; pessoa: Pessoa; tipoSugerido: TipoRegistro; batidas: Batida[] }
  | { tela: "matricula"; mensagem: string }
  | {
      tela: "sucesso";
      texto: string;
      detalhe: string;
      aviso: string | null;
      diasEmAberto: number;
      propostas: PropostaTotem[];
    }
  | { tela: "erro"; mensagem: string };

const TIPOS: { tipo: TipoRegistro; emoji: string }[] = [
  { tipo: "ENTRADA", emoji: "🟢" },
  { tipo: "INICIO_INTERVALO", emoji: "🍽" },
  { tipo: "FIM_INTERVALO", emoji: "↩️" },
  { tipo: "SAIDA", emoji: "🔴" },
];

/** Tempo que a tela de resultado fica visível antes de voltar a escanear. */
const SEGUNDOS_SUCESSO = 6;
const SEGUNDOS_ERRO = 6;
/** Se ninguém concluir a batida, o totem volta sozinho para a fila. */
const SEGUNDOS_INATIVIDADE = 45;

export default function PainelTotem({
  nomeEmpresa,
  fuso,
  salvarFoto,
  registrarLocalizacao,
  termo,
}: {
  nomeEmpresa: string;
  fuso: string;
  salvarFoto: boolean;
  registrarLocalizacao: boolean;
  termo: { secoes: SecaoTermo[]; textoAceite: string };
}) {
  const [estado, setEstado] = useState<Estado>({ tela: "ocioso" });
  const [ocupado, setOcupado] = useState(false);
  const [relogio, setRelogio] = useState("");
  const [digitado, setDigitado] = useState("");
  const [concordo, setConcordo] = useState(false);

  /** Captura da identificação em curso: reutilizada no registro e no aceite. */
  const capturaRef = useRef<ResultadoCaptura | null>(null);
  /** Matrícula digitada, quando a identificação automática ficou em dúvida. */
  const matriculaRef = useRef<string | null>(null);
  const localRef = useRef<{ latitude: number; longitude: number; precisao: number } | null>(null);

  // ---- Relógio ----
  useEffect(() => {
    const tick = () =>
      setRelogio(new Date().toLocaleTimeString("pt-BR", { timeZone: fuso, hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [fuso]);

  // ---- Localização: o tablet é fixo, então basta buscar uma vez ----
  useEffect(() => {
    if (!registrarLocalizacao || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        localRef.current = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          precisao: pos.coords.accuracy,
        };
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  }, [registrarLocalizacao]);

  const voltarAoInicio = useCallback(() => {
    capturaRef.current = null;
    matriculaRef.current = null;
    setDigitado("");
    setConcordo(false);
    setEstado({ tela: "ocioso" });
  }, []);

  // ---- Volta sozinho para a tela inicial ----
  useEffect(() => {
    const segundos =
      estado.tela === "sucesso"
        ? // Havendo ajuste a confirmar, a pessoa precisa de tempo para ler e
          // decidir — seis segundos seriam um "sim" por acidente.
          estado.propostas.length > 0
          ? SEGUNDOS_INATIVIDADE
          : SEGUNDOS_SUCESSO
        : estado.tela === "erro"
          ? SEGUNDOS_ERRO
          : estado.tela === "confirmar" || estado.tela === "termo" || estado.tela === "matricula"
            ? SEGUNDOS_INATIVIDADE
            : null;
    if (segundos === null) return;
    const id = setTimeout(voltarAoInicio, segundos * 1000);
    return () => clearTimeout(id);
  }, [estado, voltarAoInicio]);

  // ---- Identificação (disparada automaticamente pela câmera) ----
  const identificar = useCallback(
    async (captura: ResultadoCaptura, matricula?: string) => {
      capturaRef.current = captura;
      matriculaRef.current = matricula ?? null;
      setOcupado(true);
      setEstado({ tela: "processando" });
      try {
        const resposta = await fetch("/api/totem/identificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descriptor: captura.descriptor, matricula: matricula ?? null }),
        });
        const dados = await resposta.json();

        if (!resposta.ok) {
          setEstado({ tela: "erro", mensagem: dados.erro ?? "Falha ao identificar." });
          return;
        }
        if (dados.situacao !== "IDENTIFICADO") {
          if (dados.pedirMatricula) {
            setEstado({ tela: "matricula", mensagem: dados.mensagem });
          } else {
            setEstado({ tela: "erro", mensagem: dados.mensagem });
          }
          return;
        }
        if (!dados.termoAceito) {
          setEstado({ tela: "termo", pessoa: dados.funcionario });
          return;
        }
        setEstado({
          tela: "confirmar",
          pessoa: dados.funcionario,
          tipoSugerido: dados.tipoSugerido,
          batidas: dados.batidasHoje,
        });
      } catch {
        setEstado({ tela: "erro", mensagem: "Sem conexão com o servidor. Chame o responsável." });
      } finally {
        setOcupado(false);
      }
    },
    [],
  );

  // ---- Registro ----
  async function registrar(tipo: TipoRegistro) {
    const captura = capturaRef.current;
    if (!captura) return voltarAoInicio();
    setOcupado(true);
    try {
      const resposta = await fetch("/api/totem/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          descriptor: captura.descriptor,
          matricula: matriculaRef.current,
          foto: salvarFoto ? captura.foto : null,
          latitude: localRef.current?.latitude ?? null,
          longitude: localRef.current?.longitude ?? null,
          precisaoMetros: localRef.current?.precisao ?? null,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setEstado({ tela: "erro", mensagem: dados.erro ?? "Não foi possível registrar." });
        return;
      }
      setEstado({
        tela: "sucesso",
        texto: `${dados.registro.rotulo} registrada`,
        detalhe: `${dados.funcionario.primeiroNome} · ${dados.registro.hora}`,
        aviso: dados.aviso,
        diasEmAberto: dados.diasEmAberto ?? 0,
        propostas: dados.propostas ?? [],
      });
    } catch {
      setEstado({ tela: "erro", mensagem: "Sem conexão com o servidor. Chame o responsável." });
    } finally {
      setOcupado(false);
    }
  }

  // ---- Aceite do termo ----
  async function aceitarTermo() {
    const captura = capturaRef.current;
    if (!captura) return voltarAoInicio();
    setOcupado(true);
    try {
      const resposta = await fetch("/api/totem/aceitar-termo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descriptor: captura.descriptor,
          matricula: matriculaRef.current,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setEstado({ tela: "erro", mensagem: dados.erro ?? "Não foi possível registrar o aceite." });
        return;
      }
      // Segue direto para a batida, sem pedir o rosto de novo.
      await identificar(captura, matriculaRef.current ?? undefined);
    } catch {
      setEstado({ tela: "erro", mensagem: "Sem conexão com o servidor." });
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Sai da conta do totem. Fica discreto e pede confirmação de propósito: quem
   * usa esta tela o dia todo é a equipe, e desconectar sem querer deixaria a
   * loja sem bater ponto até alguém lembrar a senha do tablet.
   */
  async function sairDoTotem() {
    const certeza = confirm(
      "Desconectar este tablet do sistema?\n\n" +
        "A equipe não conseguirá bater ponto até alguém entrar de novo com o e-mail e a senha do totem.",
    );
    if (!certeza) return;
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function confirmarMatricula() {
    const captura = capturaRef.current;
    if (!captura || digitado.length === 0) return;
    identificar(captura, digitado);
  }

  const escaneando = estado.tela === "ocioso";

  return (
    <main className="min-h-screen bg-slate-900 text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col p-5">
        <header className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-slate-300">{nomeEmpresa}</span>
          <span className="font-mono text-2xl font-bold tabular-nums">{relogio || "--:--:--"}</span>
        </header>

        <div className="flex flex-1 flex-col justify-center py-4">
          {/* A câmera fica montada o tempo todo para não reiniciar a cada batida,
              mas só dispara a identificação quando o totem está ocioso. */}
          <div className={escaneando ? "" : "hidden"}>
            <h1 className="mb-1 text-center text-2xl font-bold">Bater ponto</h1>
            <p className="mb-4 text-center text-slate-300">
              Aproxime o rosto do círculo — o sistema reconhece você automaticamente.
            </p>
          </div>
          <div className={escaneando ? "" : "sr-only"} aria-hidden={!escaneando}>
            <CameraFacial
              aoCapturar={identificar}
              automatico
              ocupado={ocupado || !escaneando}
              semFoto={!salvarFoto}
            />
          </div>

          {estado.tela === "ocioso" && (
            <button
              type="button"
              onClick={() => setEstado({ tela: "matricula", mensagem: "" })}
              className="mx-auto mt-4 text-sm text-slate-400 underline"
            >
              Não está reconhecendo? Digitar matrícula
            </button>
          )}

          {estado.tela === "processando" && (
            <div className="text-center">
              <span className="mx-auto mb-4 block h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <p className="text-lg text-slate-300">Identificando…</p>
            </div>
          )}

          {estado.tela === "confirmar" && (
            <div>
              <p className="text-center text-3xl font-bold">Olá, {estado.pessoa.primeiroNome}!</p>
              <p className="mt-1 text-center text-sm text-slate-400">
                {estado.pessoa.nome} · matrícula {estado.pessoa.matricula}
              </p>

              {estado.batidas.length > 0 && (
                <p className="mt-3 text-center font-mono text-sm text-slate-400">
                  hoje: {estado.batidas.map((b) => b.hora).join(" · ")}
                </p>
              )}

              <p className="mt-6 mb-2 text-center text-sm text-slate-300">
                Toque no tipo de batida
              </p>
              <div className="grid grid-cols-2 gap-3">
                {TIPOS.map(({ tipo, emoji }) => {
                  const sugerido = tipo === estado.tipoSugerido;
                  return (
                    <button
                      key={tipo}
                      type="button"
                      disabled={ocupado}
                      onClick={() => registrar(tipo)}
                      className={`rounded-xl px-4 py-6 text-lg font-semibold transition disabled:opacity-50 ${
                        sugerido
                          ? "bg-marca-600 text-white ring-4 ring-marca-400/40"
                          : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                      }`}
                    >
                      <span className="mr-2">{emoji}</span>
                      {ROTULO_TIPO[tipo]}
                      {sugerido && (
                        <span className="mt-1 block text-xs font-normal opacity-80">sugerido</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={voltarAoInicio}
                className="mx-auto mt-5 block text-sm text-slate-400 underline"
              >
                Não sou eu / cancelar
              </button>
            </div>
          )}

          {estado.tela === "termo" && (
            <div>
              <p className="text-center text-2xl font-bold">Olá, {estado.pessoa.primeiroNome}!</p>
              <p className="mt-2 text-center text-sm text-slate-300">
                Antes do primeiro registro, precisamos do seu consentimento para usar seu rosto no
                controle de ponto.
              </p>
              <div className="mt-4 max-h-64 space-y-3 overflow-y-auto rounded-xl bg-slate-800 p-4 text-sm">
                {termo.secoes.map((secao) => (
                  <div key={secao.titulo}>
                    <h2 className="font-semibold text-white">{secao.titulo}</h2>
                    {secao.paragrafos.map((p, i) => (
                      <p key={i} className="mt-1 text-slate-300">
                        {p}
                      </p>
                    ))}
                  </div>
                ))}
                <p className="border-t border-slate-700 pt-2 text-xs italic text-slate-400">
                  {termo.textoAceite}
                </p>
              </div>

              <label className="mt-4 flex items-start gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={concordo}
                  onChange={(e) => setConcordo(e.target.checked)}
                />
                Li e concordo com o uso da minha imagem para registro de ponto.
              </label>

              <button
                type="button"
                disabled={!concordo || ocupado}
                onClick={aceitarTermo}
                className="botao-primario mt-4 w-full py-4 text-lg"
              >
                {ocupado ? "Registrando…" : "Li e aceito"}
              </button>
              <button
                type="button"
                onClick={voltarAoInicio}
                className="mx-auto mt-3 block text-sm text-slate-400 underline"
              >
                Agora não — falar com o responsável
              </button>
            </div>
          )}

          {estado.tela === "matricula" && (
            <div>
              <p className="text-center text-xl font-bold">Digite sua matrícula</p>
              {estado.mensagem && (
                <p className="mt-2 text-center text-sm text-amber-300">{estado.mensagem}</p>
              )}
              <p className="my-5 text-center font-mono text-4xl tracking-widest">
                {digitado || "—"}
              </p>
              <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "apagar", "0", "ok"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={ocupado}
                    onClick={() => {
                      if (t === "apagar") setDigitado((d) => d.slice(0, -1));
                      else if (t === "ok") confirmarMatricula();
                      else setDigitado((d) => (d.length < 20 ? d + t : d));
                    }}
                    className={`rounded-xl py-5 text-xl font-semibold transition disabled:opacity-50 ${
                      t === "ok"
                        ? "bg-marca-600 hover:bg-marca-700"
                        : t === "apagar"
                          ? "bg-slate-700 text-sm hover:bg-slate-600"
                          : "bg-slate-800 hover:bg-slate-700"
                    }`}
                  >
                    {t === "apagar" ? "⌫" : t === "ok" ? "OK" : t}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={voltarAoInicio}
                className="mx-auto mt-5 block text-sm text-slate-400 underline"
              >
                Cancelar
              </button>
            </div>
          )}

          {estado.tela === "sucesso" && (
            <div className="text-center">
              <p className="text-6xl">✅</p>
              <p className="mt-4 text-3xl font-bold text-emerald-400">{estado.texto}</p>
              <p className="mt-1 text-xl text-slate-200">{estado.detalhe}</p>
              {estado.aviso && <p className="mt-3 text-sm text-amber-300">{estado.aviso}</p>}

              {estado.diasEmAberto > 0 && (
                <p className="mx-auto mt-4 max-w-md rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-200">
                  Você tem{" "}
                  <strong>
                    {estado.diasEmAberto === 1
                      ? "1 dia sem ponto completo"
                      : `${estado.diasEmAberto} dias sem ponto completo`}
                  </strong>
                  . Procure o responsável para regularizar.
                </p>
              )}

              {estado.propostas.map((p) => (
                <ConfirmacaoDeAjuste
                  key={p.id}
                  proposta={p}
                  aoResponder={(id) =>
                    setEstado((atual) =>
                      atual.tela === "sucesso"
                        ? { ...atual, propostas: atual.propostas.filter((x) => x.id !== id) }
                        : atual,
                    )
                  }
                  capturaRef={capturaRef}
                  matriculaRef={matriculaRef}
                />
              ))}

              <button
                type="button"
                onClick={voltarAoInicio}
                className="botao-secundario mt-6 px-6 py-3"
              >
                Próxima pessoa
              </button>
            </div>
          )}

          {estado.tela === "erro" && (
            <div className="text-center">
              <p className="text-5xl">⚠️</p>
              <p className="mx-auto mt-4 max-w-md text-lg text-amber-200">{estado.mensagem}</p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setEstado({ tela: "matricula", mensagem: "" })}
                  className="botao-secundario px-5 py-3"
                >
                  Digitar matrícula
                </button>
                <button type="button" onClick={voltarAoInicio} className="botao-primario px-5 py-3">
                  Tentar de novo
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="text-center text-xs text-slate-500">
          <p>Seu rosto é convertido em um código matemático e usado apenas para registrar o ponto.</p>
          <button
            type="button"
            onClick={sairDoTotem}
            className="mt-2 text-slate-600 underline decoration-slate-700 underline-offset-2 hover:text-slate-400"
          >
            Sair do totem
          </button>
        </footer>
      </div>
    </main>
  );
}

/**
 * Cartão de de-acordo no totem.
 *
 * Reenvia o rosto junto da resposta: a sessão aberta no tablet é a do totem, e
 * quem passasse depois na frente da tela poderia confirmar um desconto de horas
 * que não é dele. O servidor reidentifica e só aceita do dono do ajuste.
 */
function ConfirmacaoDeAjuste({
  proposta,
  aoResponder,
  capturaRef,
  matriculaRef,
}: {
  proposta: PropostaTotem;
  aoResponder: (id: string) => void;
  capturaRef: React.MutableRefObject<ResultadoCaptura | null>;
  matriculaRef: React.MutableRefObject<string | null>;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const descricao =
    proposta.acao === "EXCLUIR"
      ? `excluir a batida de ${proposta.rotuloTipo.toLowerCase()}`
      : proposta.acao === "ALTERAR"
        ? `mudar a ${proposta.rotuloTipo.toLowerCase()} para ${proposta.horario}`
        : `incluir ${proposta.rotuloTipo.toLowerCase()} às ${proposta.horario}`;

  async function responder(decisao: "CONFIRMAR" | "RECUSAR") {
    const captura = capturaRef.current;
    if (!captura) {
      setErro("Aproxime o rosto da câmera de novo para responder.");
      return;
    }
    setErro(null);
    setOcupado(true);
    try {
      const r = await fetch("/api/totem/confirmar-ajuste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          solicitacaoId: proposta.id,
          decisao,
          descriptor: captura.descriptor,
          matricula: matriculaRef.current,
        }),
      });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(dados.erro ?? "Não foi possível registrar sua resposta.");
        return;
      }
      aoResponder(proposta.id);
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mx-auto mt-4 max-w-md rounded-xl bg-sky-500/15 px-4 py-4 text-left">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">
        Ajuste aguardando sua confirmação
      </p>
      <p className="mt-1 text-sm text-slate-100">
        {proposta.propostaPor ?? "O responsável"} quer {descricao} em <strong>{proposta.dia}</strong>.
      </p>
      <p className="mt-1 text-sm italic text-slate-300">“{proposta.motivo}”</p>
      {erro && <p className="mt-2 text-sm text-amber-300">{erro}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="botao-primario px-4 py-2 text-sm"
          disabled={ocupado}
          onClick={() => responder("CONFIRMAR")}
        >
          {ocupado ? "Registrando…" : "Confirmo"}
        </button>
        <button
          type="button"
          className="botao-secundario px-4 py-2 text-sm"
          disabled={ocupado}
          onClick={() => responder("RECUSAR")}
        >
          Não concordo
        </button>
      </div>
    </div>
  );
}
