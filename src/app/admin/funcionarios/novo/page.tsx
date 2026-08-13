import Link from "next/link";
import FormularioFuncionario from "@/components/FormularioFuncionario";

export const dynamic = "force-dynamic";

export default function NovoFuncionario() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/admin/funcionarios" className="text-sm text-slate-500 hover:text-slate-700">
          ← Funcionários
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Novo funcionário</h1>
        <p className="text-sm text-slate-500">
          O sistema gera uma senha provisória; o funcionário troca no primeiro acesso e cadastra o
          próprio rosto.
        </p>
      </div>
      <FormularioFuncionario modo="criar" />
    </div>
  );
}
