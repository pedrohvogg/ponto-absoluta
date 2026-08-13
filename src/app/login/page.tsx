import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { obterConfig } from "@/lib/config";
import FormularioLogin from "./FormularioLogin";

export const dynamic = "force-dynamic";

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const sessao = await lerSessao();
  if (sessao) redirect(sessao.papel === "ADMIN" ? "/admin" : "/ponto");

  const { erro } = await searchParams;
  const config = await obterConfig();

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-100 to-marca-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-marca-600 text-2xl text-white shadow-lg">
            ⏱
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Ponto Eletrônico</h1>
          <p className="text-sm text-slate-500">{config.nomeEmpresa}</p>
        </div>

        <div className="cartao p-6">
          {erro === "inativo" && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Sua sessão foi encerrada porque o acesso está inativo.
            </p>
          )}
          <FormularioLogin />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Ao registrar o ponto, sua imagem é usada apenas para conferir sua identidade.
        </p>
      </div>
    </main>
  );
}
