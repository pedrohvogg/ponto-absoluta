"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FormularioLogin() {
  const router = useRouter();
  const [identificador, setIdentificador] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identificador, senha }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível entrar.");
        return;
      }
      router.replace(dados.destino);
      router.refresh();
    } catch {
      setErro("Falha de conexão. Verifique sua internet e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div>
        <label htmlFor="identificador" className="rotulo">
          E-mail ou matrícula
        </label>
        <input
          id="identificador"
          className="campo"
          autoComplete="username"
          autoCapitalize="none"
          required
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          placeholder="voce@empresa.com"
        />
      </div>

      <div>
        <label htmlFor="senha" className="rotulo">
          Senha
        </label>
        <div className="relative">
          <input
            id="senha"
            className="campo pr-16"
            type={mostrarSenha ? "text" : "password"}
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            {mostrarSenha ? "ocultar" : "ver"}
          </button>
        </div>
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      <button type="submit" className="botao-primario w-full py-2.5" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>

      <p className="text-center text-xs text-slate-500">
        Esqueceu a senha? Peça ao administrador para gerar uma nova.
      </p>
    </form>
  );
}
