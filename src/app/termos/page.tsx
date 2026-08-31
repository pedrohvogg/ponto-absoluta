import { redirect } from "next/navigation";
import { exigirUsuario, telaInicial } from "@/lib/auth";
import { obterConfig } from "@/lib/config";
import { secoesTermoUso, TEXTO_ACEITE } from "@/lib/termoUso";
import AceitarTermo from "./AceitarTermo";

export const dynamic = "force-dynamic";

export default async function PaginaTermos() {
  const sessao = await exigirUsuario();
  // Só funcionário bate ponto: o termo de imagem não se aplica aos outros papéis.
  if (sessao.papel !== "FUNCIONARIO") redirect(telaInicial(sessao.papel));
  if (sessao.termoAceito) redirect("/ponto");

  const config = await obterConfig();
  const secoes = secoesTermoUso(config.nomeEmpresa, config.salvarFoto);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-2xl">
        <div className="cartao p-6">
          <h1 className="text-xl font-bold text-slate-900">
            Termo de consentimento para uso de imagem e biometria
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {config.nomeEmpresa} · registro eletrônico de ponto
          </p>
          <p className="mt-3 text-sm text-slate-600">
            Antes de usar o reconhecimento facial para bater o ponto, leia e concorde com os
            termos abaixo, conforme exige a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
          </p>

          <div className="mt-5 max-h-96 space-y-4 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            {secoes.map((secao) => (
              <div key={secao.titulo}>
                <h2 className="font-semibold text-slate-800">{secao.titulo}</h2>
                {secao.paragrafos.map((p, i) => (
                  <p key={i} className="mt-1 text-slate-600">
                    {p}
                  </p>
                ))}
              </div>
            ))}
            <p className="border-t border-slate-200 pt-3 text-xs italic text-slate-500">
              {TEXTO_ACEITE}
            </p>
          </div>

          <AceitarTermo />
        </div>
      </div>
    </main>
  );
}
