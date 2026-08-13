"use client";

/**
 * Camada de reconhecimento facial que roda no navegador.
 *
 * Os pesos ficam em /public/models e sao carregados uma unica vez por aba.
 * O que sai daqui e apenas um vetor de 128 numeros (o "descriptor") e, se a
 * empresa quiser guardar comprovante, uma miniatura JPEG.
 */

type FaceApi = typeof import("@vladmandic/face-api");

let faceapi: FaceApi | null = null;
let carregando: Promise<FaceApi> | null = null;

export const CAMINHO_MODELOS = "/models";

export async function carregarFaceApi(): Promise<FaceApi> {
  if (faceapi) return faceapi;
  if (carregando) return carregando;

  carregando = (async () => {
    const lib = await import("@vladmandic/face-api");

    // O namespace `tf` exportado pelos tipos do face-api cobre apenas os tipos;
    // em tempo de execução ele é o TensorFlow.js completo.
    const tf = (lib as unknown as {
      tf: { setBackend(nome: string): Promise<boolean>; ready(): Promise<void> };
    }).tf;

    try {
      await tf.setBackend("webgl");
    } catch {
      await tf.setBackend("cpu");
    }
    await tf.ready();
    await Promise.all([
      lib.nets.tinyFaceDetector.loadFromUri(CAMINHO_MODELOS),
      lib.nets.faceLandmark68Net.loadFromUri(CAMINHO_MODELOS),
      lib.nets.faceRecognitionNet.loadFromUri(CAMINHO_MODELOS),
    ]);
    faceapi = lib;
    return lib;
  })();

  return carregando;
}

export type Deteccao = {
  descriptor: number[];
  confiancaDeteccao: number;
  caixa: { x: number; y: number; largura: number; altura: number };
  /** Proporcao da largura do quadro ocupada pelo rosto (usada para orientar o usuario). */
  proporcao: number;
};

const OPCOES_DETECCAO = { inputSize: 320, scoreThreshold: 0.5 };

/** Detecta um unico rosto e devolve o descriptor de 128 dimensoes. */
export async function detectarRosto(
  video: HTMLVideoElement | HTMLCanvasElement,
): Promise<Deteccao | null> {
  const lib = await carregarFaceApi();
  const largura = "videoWidth" in video ? video.videoWidth : video.width;
  if (!largura) return null;

  const resultado = await lib
    .detectSingleFace(video, new lib.TinyFaceDetectorOptions(OPCOES_DETECCAO))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!resultado) return null;

  const caixa = resultado.detection.box;
  return {
    descriptor: Array.from(resultado.descriptor),
    confiancaDeteccao: resultado.detection.score,
    caixa: { x: caixa.x, y: caixa.y, largura: caixa.width, altura: caixa.height },
    proporcao: caixa.width / largura,
  };
}

/** Distancia euclidiana — mesma metrica usada no servidor. */
export function distancia(a: number[], b: number[]): number {
  let soma = 0;
  for (let i = 0; i < a.length; i++) soma += (a[i] - b[i]) ** 2;
  return Math.sqrt(soma);
}

/** Miniatura JPEG do quadro atual, para comprovante do registro. */
export function capturarMiniatura(video: HTMLVideoElement, larguraAlvo = 320): string | null {
  if (!video.videoWidth) return null;
  const escala = larguraAlvo / video.videoWidth;
  const canvas = document.createElement("canvas");
  canvas.width = larguraAlvo;
  canvas.height = Math.round(video.videoHeight * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

/** Mensagem de orientacao a partir do estado da deteccao. */
export function orientacao(deteccao: Deteccao | null): {
  pronto: boolean;
  mensagem: string;
} {
  if (!deteccao) return { pronto: false, mensagem: "Posicione seu rosto dentro do círculo" };
  if (deteccao.proporcao < 0.18) return { pronto: false, mensagem: "Aproxime-se um pouco mais" };
  if (deteccao.proporcao > 0.75) return { pronto: false, mensagem: "Afaste-se um pouco" };
  if (deteccao.confiancaDeteccao < 0.6)
    return { pronto: false, mensagem: "Melhore a iluminação do ambiente" };
  return { pronto: true, mensagem: "Rosto detectado — mantenha-se parado" };
}
