"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AcoesFuncionario({
  id,
  nome,
  ativo,
  temRegistros,
  temBiometria,
}: {
  id: string;
  nome: string;
  ativo: boolean;
  temRegistros: boolean;
  temBiometria: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novaSenha, setNovaSenha] = useState<string | null>(null);

  async function chamar(acao: string, corpo: object, confirmacao?: string) {
    if (confirmacao && !confirm(confirmacao)) return;
    setOcupado(acao);
    setErro(null);
    setNovaSenha(null);
    try {
      const resposta = await fetch(`/api/admin/funcionarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível concluir a ação.");
        return;
      }
      if (dados.senhaProvisoria) setNovaSenha(dados.senhaProvisoria);
      router.refresh();
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setOcupado(null);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir definitivamente o cadastro de ${nome}?`)) return;
    setOcupado("excluir");
    setErro(null);
    const resposta = await fetch(`/api/admin/funcionarios/${id}`, { method: "DELETE" });
    const dados = await resposta.json();
    setOcupado(null);
    if (!resposta.ok) {
      setErro(dados.erro ?? "Não foi possível excluir.");
      return;
    }
    router.push("/admin/funcionarios");
  }

  return (
    <div className="cartao p-4">
      <h2 className="mb-3 font-semibold text-slate-800">Ações</h2>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() =>
            chamar(
              "senha",
              { acao: "RESETAR_SENHA" },
              `Gerar uma nova senha provisória para ${nome}? A senha atual deixará de funcionar.`,
            )
          }
          disabled={ocupado !== null}
          className="botao-secundario"
        >
          {ocupado === "senha" ? "Gerando…" : "🔑 Resetar senha"}
        </button>

        <button
          onClick={() =>
            chamar(
              "ativo",
              { ativo: !ativo },
              ativo
                ? `Desativar o acesso de ${nome}? O histórico de ponto é preservado.`
                : `Reativar o acesso de ${nome}?`,
            )
          }
          disabled={ocupado !== null}
          className={ativo ? "botao-perigo" : "botao-secundario"}
        >
          {ocupado === "ativo" ? "Aplicando…" : ativo ? "🚫 Desativar acesso" : "✅ Reativar acesso"}
        </button>

        {temBiometria && (
          <button
            onClick={() =>
              chamar(
                "biometria",
                { acao: "LIMPAR_BIOMETRIA" },
                `Apagar o cadastro facial de ${nome}? Ele precisará capturar o rosto novamente para bater ponto.`,
              )
            }
            disabled={ocupado !== null}
            className="botao-secundario"
          >
            {ocupado === "biometria" ? "Removendo…" : "🙂 Limpar cadastro facial"}
          </button>
        )}

        {!temRegistros && (
          <button onClick={excluir} disabled={ocupado !== null} className="botao-perigo">
            {ocupado === "excluir" ? "Excluindo…" : "🗑 Excluir cadastro"}
          </button>
        )}
      </div>

      {novaSenha && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Nova senha provisória de <strong>{nome}</strong>:{" "}
          <span className="font-mono text-base font-bold tracking-wider">{novaSenha}</span>
          <p className="text-xs">Anote agora — ela não será exibida novamente.</p>
        </div>
      )}

      {erro && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      {temRegistros && (
        <p className="mt-3 text-xs text-slate-500">
          Este funcionário possui registros de ponto, por isso o cadastro não pode ser excluído —
          use “Desativar acesso” para preservar o histórico.
        </p>
      )}
    </div>
  );
}
