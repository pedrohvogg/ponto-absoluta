"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  carregarFaceApi,
  capturarMiniatura,
  detectarRosto,
  orientacao,
  type Deteccao,
} from "@/lib/faceCliente";

export type ResultadoCaptura = {
  descriptor: number[];
  foto: string | null;
  confiancaDeteccao: number;
};

type Props = {
  /** Chamado quando o usuário confirma a captura de um rosto válido. */
  aoCapturar: (resultado: ResultadoCaptura) => void | Promise<void>;
  /** Rótulo do botão de captura. */
  rotuloBotao?: string;
  /** Bloqueia o botão enquanto o pai processa. */
  ocupado?: boolean;
  /** Captura automaticamente assim que o rosto ficar estável. */
  automatico?: boolean;
  /** Não gera a miniatura JPEG (quando a empresa optou por não guardar foto). */
  semFoto?: boolean;
};

const INTERVALO_DETECCAO_MS = 400;
/** Quantas leituras seguidas com rosto válido antes de liberar a captura. */
const LEITURAS_ESTAVEIS = 2;

export default function CameraFacial({
  aoCapturar,
  rotuloBotao = "Capturar",
  ocupado = false,
  automatico = false,
  semFoto = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fluxoRef = useRef<MediaStream | null>(null);
  const capturandoRef = useRef(false);
  const estaveisRef = useRef(0);

  const [estado, setEstado] = useState<"carregando" | "pronta" | "erro">("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const [deteccao, setDeteccao] = useState<Deteccao | null>(null);
  const [progresso, setProgresso] = useState("Carregando reconhecimento facial…");

  // --- Inicializa modelos + câmera ---
  useEffect(() => {
    let ativo = true;

    (async () => {
      try {
        setProgresso("Carregando reconhecimento facial…");
        await carregarFaceApi();
        if (!ativo) return;

        setProgresso("Solicitando acesso à câmera…");
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Este navegador não permite acesso à câmera. Use Chrome, Edge ou Safari atualizados em uma página HTTPS.",
          );
        }
        const fluxo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!ativo) {
          fluxo.getTracks().forEach((t) => t.stop());
          return;
        }
        fluxoRef.current = fluxo;
        if (videoRef.current) {
          videoRef.current.srcObject = fluxo;
          await videoRef.current.play().catch(() => undefined);
        }
        setEstado("pronta");
      } catch (e) {
        if (!ativo) return;
        setEstado("erro");
        setErro(mensagemDeErroDeCamera(e));
      }
    })();

    return () => {
      ativo = false;
      fluxoRef.current?.getTracks().forEach((t) => t.stop());
      fluxoRef.current = null;
    };
  }, []);

  const capturar = useCallback(async () => {
    const video = videoRef.current;
    if (!video || capturandoRef.current) return;
    capturandoRef.current = true;
    try {
      const leitura = await detectarRosto(video);
      if (!leitura || !orientacao(leitura).pronto) {
        setErro("Não consegui ler seu rosto. Ajuste a posição e tente de novo.");
        return;
      }
      setErro(null);
      await aoCapturar({
        descriptor: leitura.descriptor,
        foto: semFoto ? null : capturarMiniatura(video),
        confiancaDeteccao: leitura.confiancaDeteccao,
      });
    } finally {
      capturandoRef.current = false;
    }
  }, [aoCapturar, semFoto]);

  // --- Laço de detecção contínua ---
  useEffect(() => {
    if (estado !== "pronta") return;
    let ativo = true;
    let timer: ReturnType<typeof setTimeout>;

    const laco = async () => {
      if (!ativo) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && !capturandoRef.current) {
        try {
          const leitura = await detectarRosto(video);
          if (!ativo) return;
          setDeteccao(leitura);

          const pronto = orientacao(leitura).pronto;
          estaveisRef.current = pronto ? estaveisRef.current + 1 : 0;

          if (automatico && !ocupado && estaveisRef.current >= LEITURAS_ESTAVEIS) {
            estaveisRef.current = 0;
            await capturar();
          }
        } catch {
          // Falha pontual de inferência não deve derrubar o laço.
        }
      }
      if (ativo) timer = setTimeout(laco, INTERVALO_DETECCAO_MS);
    };

    laco();
    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [estado, automatico, ocupado, capturar]);

  const guia = orientacao(deteccao);
  const podeCapturar = estado === "pronta" && guia.pronto && !ocupado;

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl bg-slate-900">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full scale-x-[-1] object-cover"
        />

        {/* Máscara circular de enquadramento */}
        {estado === "pronta" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`h-[78%] aspect-square rounded-full border-4 transition-colors ${
                guia.pronto ? "border-emerald-400" : "border-white/50"
              }`}
            />
          </div>
        )}

        {estado !== "pronta" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {estado === "carregando" ? (
              <>
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <p className="text-sm text-white/80">{progresso}</p>
              </>
            ) : (
              <p className="text-sm text-red-200">{erro}</p>
            )}
          </div>
        )}

        {estado === "pronta" && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-center">
            <p
              className={`text-sm font-medium ${guia.pronto ? "text-emerald-300" : "text-white/90"}`}
            >
              {ocupado ? "Processando…" : guia.mensagem}
            </p>
          </div>
        )}
      </div>

      {erro && estado === "pronta" && (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {erro}
        </p>
      )}

      {!automatico && (
        <button
          type="button"
          onClick={capturar}
          disabled={!podeCapturar}
          className="botao-primario w-full py-3 text-base"
        >
          {ocupado ? "Processando…" : rotuloBotao}
        </button>
      )}
    </div>
  );
}

function mensagemDeErroDeCamera(e: unknown): string {
  const nome = (e as { name?: string })?.name;
  if (nome === "NotAllowedError") {
    return "Acesso à câmera negado. Libere a permissão de câmera nas configurações do navegador e recarregue a página.";
  }
  if (nome === "NotFoundError" || nome === "DevicesNotFoundError") {
    return "Nenhuma câmera encontrada neste dispositivo.";
  }
  if (nome === "NotReadableError") {
    return "A câmera está em uso por outro aplicativo. Feche-o e tente novamente.";
  }
  return e instanceof Error ? e.message : "Não foi possível iniciar a câmera.";
}
