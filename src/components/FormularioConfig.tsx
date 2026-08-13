"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type DadosConfig = {
  nomeEmpresa: string;
  fusoHorario: string;
  geofenceAtiva: boolean;
  geofenceBloqueia: boolean;
  latitude: number | null;
  longitude: number | null;
  raioMetros: number;
  limiarFacial: number;
  salvarFoto: boolean;
  intervaloMinimoMinutos: number;
  toleranciaMinutos: number;
};

const FUSOS = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Cuiaba",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Rio_Branco",
  "America/Noronha",
];

export default function FormularioConfig({ inicial }: { inicial: DadosConfig }) {
  const router = useRouter();
  const [dados, setDados] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [buscandoLocal, setBuscandoLocal] = useState(false);

  function definir<K extends keyof DadosConfig>(campo: K, valor: DadosConfig[K]) {
    setDados((d) => ({ ...d, [campo]: valor }));
    setOk(false);
  }

  function usarLocalizacaoAtual() {
    if (!navigator.geolocation) {
      setErro("Este navegador não fornece a localização.");
      return;
    }
    setBuscandoLocal(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDados((d) => ({
          ...d,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        }));
        setBuscandoLocal(false);
        setOk(false);
      },
      () => {
        setErro("Não foi possível obter a localização. Autorize o acesso no navegador.");
        setBuscandoLocal(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      const resultado = await resposta.json();
      if (!resposta.ok) {
        setErro(resultado.erro ?? "Não foi possível salvar.");
        return;
      }
      setOk(true);
      router.refresh();
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      <section className="cartao p-4">
        <h2 className="mb-3 font-semibold text-slate-800">Empresa</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="nomeEmpresa" className="rotulo">
              Nome exibido
            </label>
            <input
              id="nomeEmpresa"
              className="campo"
              required
              value={dados.nomeEmpresa}
              onChange={(e) => definir("nomeEmpresa", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="fusoHorario" className="rotulo">
              Fuso horário
            </label>
            <select
              id="fusoHorario"
              className="campo"
              value={dados.fusoHorario}
              onChange={(e) => definir("fusoHorario", e.target.value)}
            >
              {FUSOS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="cartao p-4">
        <h2 className="mb-1 font-semibold text-slate-800">Cerca virtual</h2>
        <p className="mb-3 text-xs text-slate-500">
          Define o local onde o ponto pode ser batido. A margem de erro do GPS conta a favor do
          funcionário.
        </p>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={dados.geofenceAtiva}
            onChange={(e) => definir("geofenceAtiva", e.target.checked)}
          />
          Registrar a localização de cada batida
        </label>

        {dados.geofenceAtiva && (
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={dados.geofenceBloqueia}
                onChange={(e) => definir("geofenceBloqueia", e.target.checked)}
              />
              Bloquear o registro fora do raio (sem marcar, apenas sinaliza no painel)
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label htmlFor="latitude" className="rotulo text-xs">
                  Latitude
                </label>
                <input
                  id="latitude"
                  type="number"
                  step="0.000001"
                  className="campo"
                  value={dados.latitude ?? ""}
                  onChange={(e) =>
                    definir("latitude", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </div>
              <div>
                <label htmlFor="longitude" className="rotulo text-xs">
                  Longitude
                </label>
                <input
                  id="longitude"
                  type="number"
                  step="0.000001"
                  className="campo"
                  value={dados.longitude ?? ""}
                  onChange={(e) =>
                    definir("longitude", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </div>
              <div>
                <label htmlFor="raioMetros" className="rotulo text-xs">
                  Raio (metros)
                </label>
                <input
                  id="raioMetros"
                  type="number"
                  min={20}
                  max={50000}
                  className="campo"
                  value={dados.raioMetros}
                  onChange={(e) => definir("raioMetros", Number(e.target.value))}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={usarLocalizacaoAtual}
                className="botao-secundario"
                disabled={buscandoLocal}
              >
                {buscandoLocal ? "Obtendo…" : "📍 Usar minha localização atual"}
              </button>
              {dados.latitude != null && dados.longitude != null && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${dados.latitude}&mlon=${dados.longitude}#map=17/${dados.latitude}/${dados.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="botao-secundario"
                >
                  Ver no mapa
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="cartao p-4">
        <h2 className="mb-3 font-semibold text-slate-800">Reconhecimento facial</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="limiarFacial" className="rotulo">
              Rigor da validação: {dados.limiarFacial.toFixed(2)}
            </label>
            <input
              id="limiarFacial"
              type="range"
              min={0.35}
              max={0.65}
              step={0.01}
              className="w-full"
              value={dados.limiarFacial}
              onChange={(e) => definir("limiarFacial", Number(e.target.value))}
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>0,35 — mais rigoroso (pode recusar a pessoa certa)</span>
              <span>0,65 — mais tolerante</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Recomendado: 0,50. Valores acima de 0,60 aumentam o risco de confundir pessoas
              parecidas.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={dados.salvarFoto}
              onChange={(e) => definir("salvarFoto", e.target.checked)}
            />
            Guardar a selfie de cada registro como comprovante
          </label>

          <div className="max-w-xs">
            <label htmlFor="intervaloMinimo" className="rotulo">
              Intervalo mínimo entre batidas (min)
            </label>
            <input
              id="intervaloMinimo"
              type="number"
              min={0}
              max={120}
              className="campo"
              value={dados.intervaloMinimoMinutos}
              onChange={(e) => definir("intervaloMinimoMinutos", Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      <section className="cartao p-4">
        <h2 className="mb-3 font-semibold text-slate-800">Jornada</h2>
        <div className="max-w-xs">
          <label htmlFor="tolerancia" className="rotulo">
            Tolerância de atraso (min)
          </label>
          <input
            id="tolerancia"
            type="number"
            min={0}
            max={120}
            className="campo"
            value={dados.toleranciaMinutos}
            onChange={(e) => definir("toleranciaMinutos", Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-slate-500">
            Minutos além do horário previsto que não contam como atraso.
          </p>
        </div>
      </section>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {ok && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Configurações salvas.
        </p>
      )}

      <button type="submit" className="botao-primario" disabled={enviando}>
        {enviando ? "Salvando…" : "Salvar configurações"}
      </button>
    </form>
  );
}
