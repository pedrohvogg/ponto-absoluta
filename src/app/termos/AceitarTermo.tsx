"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AceitarTermo() {
  const router = useRouter();
  const [concordo, setConcordo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aceitar() {
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/termos/aceitar", { method: "POST" });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível registrar seu aceite. Tente novamente.");
        return;
      }
      router.replace(dados.destino);
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-5 space-y-3">
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={concordo}
          onChange={(e) => setConcordo(e.target.checked)}
        />
        Li e concordo com o termo de uso de imagem e biometria descrito acima.
      </label>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      <button
        type="button"
        onClick={aceitar}
        disabled={!concordo || enviando}
        className="botao-primario w-full py-2.5"
      >
        {enviando ? "Registrando…" : "Li e aceito"}
      </button>

      <p className="text-center text-xs text-slate-500">
        Se preferir não usar o reconhecimento facial, fale com o responsável: ele pode lançar seu
        ponto manualmente.
      </p>
    </div>
  );
}
