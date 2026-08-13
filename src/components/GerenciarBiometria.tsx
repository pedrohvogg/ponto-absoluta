"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CameraFacial, { type ResultadoCaptura } from "./CameraFacial";

type Item = { id: string; foto: string | null; criadoEm: string };

export default function GerenciarBiometria({
  biometriasIniciais,
  usuarioId,
}: {
  biometriasIniciais: Item[];
  /** Informado quando o admin cadastra o rosto de um funcionário. */
  usuarioId?: string;
}) {
  const router = useRouter();
  const [itens, setItens] = useState<Item[]>(biometriasIniciais);
  const [camera, setCamera] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function salvar(captura: ResultadoCaptura) {
    setOcupado(true);
    setMensagem(null);
    try {
      const resposta = await fetch("/api/biometria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descriptor: captura.descriptor,
          foto: captura.foto,
          usuarioId,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setMensagem({ tipo: "erro", texto: dados.erro ?? "Não foi possível salvar." });
        return;
      }
      setItens((atual) => [
        { id: dados.biometria.id, foto: captura.foto, criadoEm: dados.biometria.criadoEm },
        ...atual,
      ]);
      setMensagem({
        tipo: "ok",
        texto:
          dados.total >= 3
            ? "Captura salva. Seu cadastro facial está completo."
            : `Captura salva (${dados.total} de 3 recomendadas).`,
      });
      router.refresh();
    } catch {
      setMensagem({ tipo: "erro", texto: "Falha de conexão. Tente novamente." });
    } finally {
      setOcupado(false);
    }
  }

  async function remover(id: string) {
    if (!confirm("Remover esta captura?")) return;
    const resposta = await fetch(`/api/biometria/${id}`, { method: "DELETE" });
    if (resposta.ok) {
      setItens((atual) => atual.filter((i) => i.id !== id));
      router.refresh();
    } else {
      setMensagem({ tipo: "erro", texto: "Não foi possível remover." });
    }
  }

  return (
    <div className="space-y-4">
      <div className="cartao p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">
              Capturas cadastradas ({itens.length})
            </h2>
            <p className="text-xs text-slate-500">
              {itens.length === 0
                ? "Nenhuma captura ainda — o ponto ficará bloqueado."
                : itens.length < 3
                  ? "Adicione mais capturas para aumentar a precisão."
                  : "Cadastro completo."}
            </p>
          </div>
          <button
            onClick={() => setCamera((v) => !v)}
            className={camera ? "botao-secundario" : "botao-primario"}
          >
            {camera ? "Fechar câmera" : "Adicionar captura"}
          </button>
        </div>

        {itens.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {itens.map((item) => (
              <li key={item.id} className="overflow-hidden rounded-lg border border-slate-200">
                {item.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.foto}
                    alt="Captura facial cadastrada"
                    className="aspect-square w-full scale-x-[-1] object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-slate-100 text-3xl">
                    🙂
                  </div>
                )}
                <div className="p-2">
                  <p className="text-[11px] text-slate-500">
                    {new Date(item.criadoEm).toLocaleDateString("pt-BR")}
                  </p>
                  <button
                    onClick={() => remover(item.id)}
                    className="mt-1 text-xs font-medium text-red-600 hover:underline"
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {camera && (
        <div className="cartao p-4">
          <CameraFacial
            aoCapturar={salvar}
            rotuloBotao="Salvar esta captura"
            ocupado={ocupado}
          />
        </div>
      )}

      {mensagem && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${
            mensagem.tipo === "ok"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
