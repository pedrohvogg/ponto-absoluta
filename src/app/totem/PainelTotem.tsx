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

type DiaPendenteTotem = {
  dia: string;
  diaBr: string;
  diaSemana: string;
  rotuloMotivo: string;
  entradaPrevista: string;
  saidaPrevista: string;
  batidas: { hora: string; rotulo: string }[];
  jaSolicitado: boolean;
};

type Pendencias = { dias: DiaPendenteTotem[]; propostas: PropostaTotem[] };

const SEM_PENDENCIAS: Pendencias = { dias: [], propostas: [] };

/** Motivos prontos: digitar texto corrido num quiosque é inviável. */
const MOTIVOS = [
  "Esqueci de registrar o ponto nesse dia.",
  "Estava em atendimento e não consegui vir ao totem.",
  "O totem estava fora do ar nesse horário.",
  "Saí para uma tarefa externa a serviço da loja.",
];

type Estado =
  /** Câmera desligada, esperando alguém tocar o botão. Estado inicial. */
  | { tela: "repouso" }
  /** Câmera ligada, procurando um rosto. */
  | { tela: "ocioso" }
  | { tela: "processando" }
  | { tela: "termo"; pessoa: Pessoa }
  | {
      tela: "confirmar";
      pessoa: Pessoa;
      tipoSugerido: TipoRegistro;
      batidas: Batida[];
      pendencias: Pendencias;
    }
  /** Lista de dias em aberto, de onde a pessoa pede o ajuste. */
  | { tela: "pendencias"; pessoa: Pessoa; pendencias: Pendencias; voltarPara: "confirmar" | "repouso" }
  | { tela: "matricula"; mensagem: string }
  | {
      tela: "sucesso";
      texto: string;
      detalhe: string;
      aviso: string | null;
      pessoa: Pessoa;
      pendencias: Pendencias;
    }
  | { tela: "erro"; mensagem: string };

const TIPOS: { tipo: TipoRegistro; emoji: string }[] = [
  { tipo: "ENTRADA", emoji: "🟢" },
  { tipo: "INICIO_INTERVALO", emoji: "🍽" },
  { tipo: "FIM_INTERVALO", emoji: "↩️" },
  { tipo: "SAIDA", emoji: "🔴" },
];

/** Tempo que a tela de resultado fica visível antes de voltar ao repouso. */
const SEGUNDOS_SUCESSO = 6;
const SEGUNDOS_ERRO = 6;
/** Se ninguém concluir a batida, o totem volta sozinho para a fila. */
const SEGUNDOS_INATIVIDADE = 45;
/**
 * Quanto a câmera fica procurando um rosto antes de desligar sozinha.
 *
 * Existe para o caso de alguém tocar o botão e se afastar: sem isso, o primeiro
 * toque do dia deixaria a câmera ligada até a loja fechar, que é justamente o
 * que este modo evita. Reconhecendo um rosto, a tela muda e o relógio para.
 */
const SEGUNDOS_PROCURANDO = 60;

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
  const [estado, setEstado] = useState<Estado>({ tela: "repouso" });
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
    // Volta para o repouso, e não para a leitura: é o desmonte da câmera que
    // de fato apaga a luz do tablet e libera o aparelho.
    setEstado({ tela: "repouso" });
  }, []);

  // ---- Volta sozinho para a tela inicial ----
  useEffect(() => {
    const segundos =
      estado.tela === "sucesso"
        ? // Havendo ajuste a confirmar, a pessoa precisa de tempo para ler e
          // decidir — seis segundos seriam um "sim" por acidente.
          estado.pendencias.propostas.length > 0
          ? SEGUNDOS_INATIVIDADE
          : SEGUNDOS_SUCESSO
        : estado.tela === "erro"
          ? SEGUNDOS_ERRO
          : estado.tela === "ocioso"
            ? SEGUNDOS_PROCURANDO
            : estado.tela === "confirmar" ||
                estado.tela === "termo" ||
                estado.tela === "matricula" ||
                estado.tela === "pendencias"
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
          pendencias: dados.pendencias ?? SEM_PENDENCIAS,
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
        pessoa: dados.funcionario,
        pendencias: dados.pendencias ?? SEM_PENDENCIAS,
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
    if (digitado.length === 0) return;
    // A matrícula sozinha nunca basta: o servidor confere o rosto contra ela.
    // Sem uma captura, o pedido seria recusado lá — dizer isso aqui evita o
    // botão que parece não fazer nada.
    if (!captura) {
      setEstado({
        tela: "matricula",
        mensagem:
          "Ainda não vimos seu rosto. Toque em “Voltar” e fique de frente para a câmera até o círculo ficar verde.",
      });
      return;
    }
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
          {estado.tela === "repouso" && (
            <div className="text-center">
              <h1 className="text-3xl font-bold">Bater ponto</h1>
              <p className="mt-2 text-slate-300">
                Toque no botão e olhe para a tela. A câmera liga só neste momento.
              </p>
              <button
                type="button"
                onClick={() => setEstado({ tela: "ocioso" })}
                className="mx-auto mt-8 flex h-44 w-44 flex-col items-center justify-center rounded-full bg-marca-600 text-white shadow-2xl transition active:scale-95 hover:bg-marca-500"
              >
                <span className="text-5xl">📷</span>
                <span className="mt-2 text-lg font-bold">Registrar</span>
              </button>
              <p className="mt-8 text-sm text-slate-500">
                A câmera permanece desligada até alguém tocar aqui.
              </p>
            </div>
          )}

          {/* A câmera só existe enquanto o totem está procurando um rosto: ao sair
              desta tela o componente é desmontado, e é o desmonte que encerra o
              fluxo de vídeo e apaga a luz do tablet. O custo é a partida de alguns
              segundos a cada batida — preço justo para não deixar a câmera de uma
              loja ligada o expediente inteiro. */}
          {escaneando && (
            <>
              <h1 className="mb-1 text-center text-2xl font-bold">Bater ponto</h1>
              <p className="mb-4 text-center text-slate-300">
                Aproxime o rosto do círculo — o sistema reconhece você automaticamente.
              </p>
              <CameraFacial
                aoCapturar={identificar}
                automatico
                ocupado={ocupado}
                semFoto={!salvarFoto}
              />
              <div className="mt-4 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEstado({ tela: "matricula", mensagem: "" })}
                  className="text-sm text-slate-400 underline"
                >
                  Não está reconhecendo? Digitar matrícula
                </button>
                <button
                  type="button"
                  onClick={voltarAoInicio}
                  className="text-sm text-slate-500 underline"
                >
                  Cancelar e desligar a câmera
                </button>
              </div>
            </>
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

              {contarEmAberto(estado.pendencias) > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setEstado({
                      tela: "pendencias",
                      pessoa: estado.pessoa,
                      pendencias: estado.pendencias,
                      voltarPara: "confirmar",
                    })
                  }
                  className="mx-auto mt-5 block rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-200 underline"
                >
                  {contarEmAberto(estado.pendencias) === 1
                    ? "Você tem 1 dia sem ponto completo"
                    : `Você tem ${contarEmAberto(estado.pendencias)} dias sem ponto completo`}{" "}
                  — ver e pedir ajuste
                </button>
              )}

              <button
                type="button"
                onClick={voltarAoInicio}
                className="mx-auto mt-5 block text-sm text-slate-400 underline"
              >
                Não sou eu / cancelar
              </button>
            </div>
          )}

          {estado.tela === "pendencias" && (
            <TelaPendencias
              pessoa={estado.pessoa}
              pendencias={estado.pendencias}
              capturaRef={capturaRef}
              matriculaRef={matriculaRef}
              aoPedir={(dia) =>
                setEstado((atual) =>
                  atual.tela === "pendencias"
                    ? {
                        ...atual,
                        pendencias: {
                          ...atual.pendencias,
                          dias: atual.pendencias.dias.map((d) =>
                            d.dia === dia ? { ...d, jaSolicitado: true } : d,
                          ),
                        },
                      }
                    : atual,
                )
              }
              aoVoltar={voltarAoInicio}
            />
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
              <div className="mt-5 flex justify-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setDigitado("");
                    setEstado({ tela: "ocioso" });
                  }}
                  className="text-sm text-slate-300 underline"
                >
                  Voltar para a câmera
                </button>
                <button
                  type="button"
                  onClick={voltarAoInicio}
                  className="text-sm text-slate-400 underline"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {estado.tela === "sucesso" && (
            <div className="text-center">
              <p className="text-6xl">✅</p>
              <p className="mt-4 text-3xl font-bold text-emerald-400">{estado.texto}</p>
              <p className="mt-1 text-xl text-slate-200">{estado.detalhe}</p>
              {estado.aviso && <p className="mt-3 text-sm text-amber-300">{estado.aviso}</p>}

              {estado.pendencias.dias.filter((d) => !d.jaSolicitado).length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setEstado({
                      tela: "pendencias",
                      pessoa: estado.pessoa,
                      pendencias: estado.pendencias,
                      voltarPara: "repouso",
                    })
                  }
                  className="mx-auto mt-4 block max-w-md rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-200 underline"
                >
                  Você tem{" "}
                  <strong>
                    {contarEmAberto(estado.pendencias) === 1
                      ? "1 dia sem ponto completo"
                      : `${contarEmAberto(estado.pendencias)} dias sem ponto completo`}
                  </strong>
                  . Toque para resolver agora.
                </button>
              )}

              {estado.pendencias.propostas.map((p) => (
                <ConfirmacaoDeAjuste
                  key={p.id}
                  proposta={p}
                  aoResponder={(id) =>
                    setEstado((atual) =>
                      atual.tela === "sucesso"
                        ? {
                            ...atual,
                            pendencias: {
                              ...atual.pendencias,
                              propostas: atual.pendencias.propostas.filter((x) => x.id !== id),
                            },
                          }
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

/** Dias em aberto que ainda não viraram pedido. */
function contarEmAberto(p: Pendencias): number {
  return p.dias.filter((d) => !d.jaSolicitado).length;
}

/**
 * Lista de dias pendentes no totem, com o pedido de ajuste embutido.
 *
 * Pensada para dedo em tela de tablet e para quem não tem login: nada de
 * texto corrido — o motivo vem de botões prontos e o horário sai do seletor
 * nativo, que no tablet abre um relógio grande.
 */
function TelaPendencias({
  pessoa,
  pendencias,
  capturaRef,
  matriculaRef,
  aoPedir,
  aoVoltar,
}: {
  pessoa: Pessoa;
  pendencias: Pendencias;
  capturaRef: React.MutableRefObject<ResultadoCaptura | null>;
  matriculaRef: React.MutableRefObject<string | null>;
  aoPedir: (dia: string) => void;
  aoVoltar: () => void;
}) {
  const [abertoEm, setAbertoEm] = useState<string | null>(null);

  return (
    <div>
      <p className="text-center text-2xl font-bold">{pessoa.primeiroNome}, faltam batidas</p>
      <p className="mx-auto mt-2 max-w-lg text-center text-sm text-slate-300">
        Nestes dias o ponto ficou incompleto. Peça o ajuste e o responsável analisa — as horas
        não entram sozinhas.
      </p>

      <ul className="mx-auto mt-5 max-w-lg space-y-2">
        {pendencias.dias.map((d) => (
          <li key={d.dia} className="rounded-xl bg-slate-800 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {d.diaBr} <span className="font-normal text-slate-400">({d.diaSemana})</span>
                </p>
                <p className="text-xs text-slate-400">
                  {d.batidas.length === 0
                    ? `Nenhuma batida · previsto ${d.entradaPrevista}–${d.saidaPrevista}`
                    : `Registrado ${d.batidas.map((b) => b.hora).join(", ")} · ${d.rotuloMotivo}`}
                </p>
              </div>
              {d.jaSolicitado ? (
                <span className="rounded-lg bg-slate-700 px-3 py-1 text-xs text-slate-300">
                  Em análise
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setAbertoEm(abertoEm === d.dia ? null : d.dia)}
                  className="rounded-lg bg-marca-600 px-4 py-2 text-sm font-semibold"
                >
                  {abertoEm === d.dia ? "Fechar" : "Pedir ajuste"}
                </button>
              )}
            </div>
            {abertoEm === d.dia && !d.jaSolicitado && (
              <PedidoNoTotem
                dia={d}
                capturaRef={capturaRef}
                matriculaRef={matriculaRef}
                aoEnviar={() => {
                  setAbertoEm(null);
                  aoPedir(d.dia);
                }}
              />
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={aoVoltar}
        className="mx-auto mt-6 block text-sm text-slate-400 underline"
      >
        Concluir
      </button>
    </div>
  );
}

function PedidoNoTotem({
  dia,
  capturaRef,
  matriculaRef,
  aoEnviar,
}: {
  dia: DiaPendenteTotem;
  capturaRef: React.MutableRefObject<ResultadoCaptura | null>;
  matriculaRef: React.MutableRefObject<string | null>;
  aoEnviar: () => void;
}) {
  // Sem batida nenhuma, o esquecido quase sempre é a entrada; com batida
  // solta, costuma ser a saída que faltou.
  const semBatida = dia.batidas.length === 0;
  const [tipo, setTipo] = useState<TipoRegistro>(semBatida ? "ENTRADA" : "SAIDA");
  const [horario, setHorario] = useState(semBatida ? dia.entradaPrevista : dia.saidaPrevista);
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    const captura = capturaRef.current;
    if (!captura) {
      setErro("Aproxime o rosto da câmera de novo para enviar o pedido.");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch("/api/totem/solicitar-ajuste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dia: dia.dia,
          tipo,
          horario,
          motivo,
          descriptor: captura.descriptor,
          matricula: matriculaRef.current,
        }),
      });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(dados.erro ?? "Não foi possível enviar o pedido.");
        return;
      }
      aoEnviar();
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-700 pt-4">
      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Qual batida faltou</p>
        <div className="grid grid-cols-2 gap-2">
          {TIPOS.map(({ tipo: t, emoji }) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`rounded-lg px-3 py-3 text-sm font-medium ${
                tipo === t ? "bg-marca-600 text-white" : "bg-slate-700 text-slate-200"
              }`}
            >
              <span className="mr-1">{emoji}</span>
              {ROTULO_TIPO[t]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Que horas</p>
        <input
          type="time"
          value={horario}
          onChange={(e) => setHorario(e.target.value)}
          className="w-full rounded-lg bg-slate-700 px-4 py-3 text-center text-2xl font-bold tabular-nums text-white"
        />
      </div>

      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Por quê</p>
        <div className="space-y-2">
          {MOTIVOS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMotivo(m)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                motivo === m ? "bg-marca-600 text-white" : "bg-slate-700 text-slate-200"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {erro && <p className="text-sm text-amber-300">{erro}</p>}

      <button
        type="button"
        onClick={enviar}
        disabled={enviando}
        className="botao-primario w-full py-3 text-base"
      >
        {enviando ? "Enviando…" : "Enviar pedido ao responsável"}
      </button>
    </div>
  );
}
