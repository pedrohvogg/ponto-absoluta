"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrigemRegistro, TipoRegistro } from "@prisma/client";
import { ROTULO_TIPO } from "@/lib/jornada";
import CameraFacial, { type ResultadoCaptura } from "./CameraFacial";
import { EtiquetaTipo } from "./Etiquetas";

type RegistroLocal = {
  id: string;
  tipo: TipoRegistro;
  momento: string;
  origem: OrigemRegistro;
  dentroDaCerca: boolean | null;
};

const TIPOS: { tipo: TipoRegistro; emoji: string }[] = [
  { tipo: "ENTRADA", emoji: "🟢" },
  { tipo: "INICIO_INTERVALO", emoji: "🍽" },
  { tipo: "FIM_INTERVALO", emoji: "↩️" },
  { tipo: "SAIDA", emoji: "🔴" },
];

export default function PainelPonto({
  tipoSugerido,
  exigeLocalizacao,
  salvarFoto,
  registrosIniciais,
  fuso,
}: {
  tipoSugerido: TipoRegistro;
  exigeLocalizacao: boolean;
  salvarFoto: boolean;
  registrosIniciais: RegistroLocal[];
  fuso: string;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoRegistro>(tipoSugerido);
  const [camera, setCamera] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [registros, setRegistros] = useState(registrosIniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<{ rotulo: string; hora: string; aviso: string | null } | null>(
    null,
  );
  const [relogio, setRelogio] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setRelogio(
        new Date().toLocaleTimeString("pt-BR", { timeZone: fuso, hour12: false }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [fuso]);

  async function registrar(captura: ResultadoCaptura) {
    setOcupado(true);
    setErro(null);
    setSucesso(null);
    try {
      const local = exigeLocalizacao ? await obterLocalizacao() : null;
      if (exigeLocalizacao && !local) {
        setErro(
          "Não foi possível obter sua localização. Autorize o acesso no navegador e tente de novo.",
        );
        return;
      }

      const resposta = await fetch("/api/ponto/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          descriptor: captura.descriptor,
          foto: salvarFoto ? captura.foto : null,
          latitude: local?.latitude ?? null,
          longitude: local?.longitude ?? null,
          precisaoMetros: local?.precisao ?? null,
        }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível registrar o ponto.");
        return;
      }

      setSucesso({ rotulo: dados.registro.rotulo, hora: dados.registro.hora, aviso: dados.aviso });
      setRegistros((atual) => [
        ...atual,
        {
          id: dados.registro.id,
          tipo: dados.registro.tipo,
          momento: new Date().toISOString(),
          origem: "FACIAL",
          dentroDaCerca: dados.aviso ? false : null,
        },
      ]);
      setCamera(false);
      setTipo(proximo(dados.registro.tipo));
      router.refresh();
    } catch {
      setErro("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="cartao overflow-hidden">
        <div className="bg-slate-900 py-5 text-center">
          <p className="font-mono text-4xl font-bold tabular-nums text-white">{relogio || "--:--:--"}</p>
          <p className="text-xs text-slate-400">horário oficial do servidor no momento do registro</p>
        </div>

        <div className="p-4">
          <p className="rotulo">Selecione o tipo de batida</p>
          <div className="grid grid-cols-2 gap-2">
            {TIPOS.map(({ tipo: t, emoji }) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTipo(t);
                  setErro(null);
                }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-3 text-left text-sm font-medium transition ${
                  tipo === t
                    ? "border-marca-500 bg-marca-50 text-marca-900 ring-2 ring-marca-200"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="text-lg">{emoji}</span>
                <span>
                  {ROTULO_TIPO[t]}
                  {t === tipoSugerido && (
                    <span className="ml-1 text-[10px] font-semibold uppercase text-marca-600">
                      sugerido
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {!camera && (
            <button onClick={() => setCamera(true)} className="botao-primario mt-4 w-full py-3 text-base">
              📷 Registrar {ROTULO_TIPO[tipo].toLowerCase()}
            </button>
          )}
        </div>

        {camera && (
          <div className="border-t border-slate-200 p-4">
            <CameraFacial
              aoCapturar={registrar}
              rotuloBotao={`Confirmar ${ROTULO_TIPO[tipo].toLowerCase()}`}
              ocupado={ocupado}
              semFoto={!salvarFoto}
            />
            <button
              onClick={() => setCamera(false)}
              className="botao-secundario mt-2 w-full"
              disabled={ocupado}
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {sucesso && (
        <div role="status" className="cartao border-emerald-200 bg-emerald-50 p-4 text-center">
          <p className="text-2xl">✅</p>
          <p className="font-semibold text-emerald-900">
            {sucesso.rotulo} registrada às {sucesso.hora}
          </p>
          {sucesso.aviso && <p className="mt-1 text-sm text-amber-700">{sucesso.aviso}</p>}
        </div>
      )}

      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-700">
          {erro}
        </p>
      )}

      <div className="cartao p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Batidas de hoje</h2>
        {registros.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum registro hoje.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {registros.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <EtiquetaTipo tipo={r.tipo} />
                <div className="flex items-center gap-2">
                  {r.dentroDaCerca === false && (
                    <span className="etiqueta bg-amber-100 text-amber-800">fora do local</span>
                  )}
                  <span className="font-mono text-sm tabular-nums text-slate-700">
                    {new Date(r.momento).toLocaleTimeString("pt-BR", {
                      timeZone: fuso,
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function proximo(tipo: TipoRegistro): TipoRegistro {
  switch (tipo) {
    case "ENTRADA":
      return "INICIO_INTERVALO";
    case "INICIO_INTERVALO":
      return "FIM_INTERVALO";
    case "FIM_INTERVALO":
      return "SAIDA";
    default:
      return "ENTRADA";
  }
}

function obterLocalizacao(): Promise<{ latitude: number; longitude: number; precisao: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          precisao: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}
