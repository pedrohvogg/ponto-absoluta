import { exigirUsuario } from "@/lib/auth";
import FormularioTrocaSenha from "./FormularioTrocaSenha";

export const dynamic = "force-dynamic";

export default async function PaginaTrocarSenha() {
  const sessao = await exigirUsuario();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="cartao p-6">
          <h1 className="text-xl font-bold text-slate-900">Defina sua senha</h1>
          <p className="mt-1 mb-5 text-sm text-slate-500">
            {sessao.trocarSenha
              ? "Você está usando uma senha provisória. Escolha uma senha pessoal para continuar."
              : "Altere sua senha de acesso."}
          </p>
          <FormularioTrocaSenha obrigatorio={sessao.trocarSenha} papel={sessao.papel} />
        </div>
      </div>
    </main>
  );
}
