"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function FormularioTrocaSenha({
  obrigatorio,
  papel,
}: {
  obrigatorio: boolean;
  papel: string;
}) {
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (novaSenha !== confirmacao) {
      setErro("A confirmação não confere com a nova senha.");
      return;
    }
    setEnviando(true);
    try {
      const resposta = await fetch("/api/auth/trocar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível alterar a senha.");
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
    <form onSubmit={enviar} className="space-y-4">
      <div>
        <label htmlFor="atual" className="rotulo">
          Senha atual
        </label>
        <input
          id="atual"
          type="password"
          className="campo"
          autoComplete="current-password"
          required
          value={senhaAtual}
          onChange={(e) => setSenhaAtual(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="nova" className="rotulo">
          Nova senha
        </label>
        <input
          id="nova"
          type="password"
          className="campo"
          autoComplete="new-password"
          required
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">Mínimo de 8 caracteres, com letras e números.</p>
      </div>
      <div>
        <label htmlFor="confirmar" className="rotulo">
          Confirmar nova senha
        </label>
        <input
          id="confirmar"
          type="password"
          className="campo"
          autoComplete="new-password"
          required
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      <button type="submit" className="botao-primario w-full" disabled={enviando}>
        {enviando ? "Salvando…" : "Salvar senha"}
      </button>

      {!obrigatorio && (
        <Link
          href={papel === "ADMIN" ? "/admin" : "/ponto"}
          className="block text-center text-sm text-slate-500 hover:text-slate-700"
        >
          Voltar
        </Link>
      )}
    </form>
  );
}
