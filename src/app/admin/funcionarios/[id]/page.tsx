import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obterConfig } from "@/lib/config";
import { diaBr, hojeStr, horaDe, limitesDoMes, minutosParaHoras } from "@/lib/datas";
import { espelhoDePonto } from "@/lib/consultas";
import { totalizar } from "@/lib/jornada";
import FormularioFuncionario from "@/components/FormularioFuncionario";
import AcoesFuncionario from "@/components/AcoesFuncionario";
import { EtiquetaOrigem, EtiquetaTipo } from "@/components/Etiquetas";

export const dynamic = "force-dynamic";

export default async function DetalheFuncionario({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const config = await obterConfig();

  const funcionario = await prisma.usuario.findUnique({
    where: { id },
    include: {
      biometrias: { orderBy: { criadoEm: "desc" }, select: { id: true, fotoBase64: true, criadoEm: true } },
      _count: { select: { registros: true } },
    },
  });
  if (!funcionario) notFound();

  const { de, ate } = limitesDoMes(hojeStr(config.fusoHorario));
  const espelho = await espelhoDePonto(id, de, ate);
  const totais = espelho ? totalizar(espelho.jornadas) : null;

  const ultimos = await prisma.registro.findMany({
    where: { usuarioId: id },
    orderBy: { momento: "desc" },
    take: 12,
    select: { id: true, tipo: true, momento: true, dia: true, origem: true, dentroDaCerca: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/funcionarios" className="text-sm text-slate-500 hover:text-slate-700">
            ← Funcionários
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold text-slate-900">
            {funcionario.nome}
            {!funcionario.ativo && (
              <span className="etiqueta bg-slate-200 text-slate-600">inativo</span>
            )}
            {funcionario.papel === "ADMIN" && (
              <span className="etiqueta bg-purple-100 text-purple-800">admin</span>
            )}
          </h1>
          <p className="text-sm text-slate-500">
            {funcionario.email} · matrícula {funcionario.matricula}
          </p>
        </div>
        <Link
          href={`/admin/relatorios?funcionarioId=${id}&de=${de}&ate=${ate}`}
          className="botao-secundario"
        >
          Espelho de ponto
        </Link>
      </div>

      {totais && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador titulo="Trabalhado no mês" valor={minutosParaHoras(totais.trabalhado)} />
          <Indicador titulo="Previsto" valor={minutosParaHoras(totais.previsto)} />
          <Indicador
            titulo="Saldo"
            valor={minutosParaHoras(totais.saldo)}
            cor={totais.saldo >= 0 ? "text-emerald-600" : "text-red-600"}
          />
          <Indicador titulo="Dias com atraso" valor={String(totais.atrasos)} />
        </div>
      )}

      <AcoesFuncionario
        id={funcionario.id}
        nome={funcionario.nome}
        ativo={funcionario.ativo}
        temRegistros={funcionario._count.registros > 0}
        temBiometria={funcionario.biometrias.length > 0}
      />

      <section className="cartao p-4">
        <h2 className="mb-3 font-semibold text-slate-800">
          Cadastro facial ({funcionario.biometrias.length})
        </h2>
        {funcionario.biometrias.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Nenhuma captura. O funcionário precisa acessar <strong>Meu rosto</strong> e cadastrar o
            próprio rosto antes de bater ponto.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {funcionario.biometrias.map((b) => (
              <li key={b.id} className="w-28 overflow-hidden rounded-lg border border-slate-200">
                {b.fotoBase64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.fotoBase64} alt="" className="aspect-square w-full scale-x-[-1] object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-slate-100 text-2xl">
                    🙂
                  </div>
                )}
                <p className="p-1 text-center text-[10px] text-slate-500">
                  {b.criadoEm.toLocaleDateString("pt-BR")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cartao overflow-hidden">
        <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-800">
          Últimos registros
        </h2>
        {ultimos.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Nenhum registro ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {ultimos.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                <span className="w-20 font-mono text-xs text-slate-500">{diaBr(r.dia)}</span>
                <span className="w-14 font-mono tabular-nums">
                  {horaDe(r.momento, config.fusoHorario)}
                </span>
                <EtiquetaTipo tipo={r.tipo} />
                <EtiquetaOrigem origem={r.origem} />
                {r.dentroDaCerca === false && (
                  <span className="etiqueta bg-amber-100 text-amber-800">fora do local</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-slate-800">Editar cadastro e jornada</h2>
        <FormularioFuncionario
          modo="editar"
          inicial={{
            id: funcionario.id,
            nome: funcionario.nome,
            email: funcionario.email,
            matricula: funcionario.matricula,
            cargo: funcionario.cargo ?? "",
            departamento: funcionario.departamento ?? "",
            papel: funcionario.papel,
            cargaDiariaMinutos: funcionario.cargaDiariaMinutos,
            entradaPrevista: funcionario.entradaPrevista,
            saidaPrevista: funcionario.saidaPrevista,
            intervaloMinutos: funcionario.intervaloMinutos,
            diasSemana: funcionario.diasSemana,
          }}
        />
      </section>
    </div>
  );
}

function Indicador({
  titulo,
  valor,
  cor = "text-slate-900",
}: {
  titulo: string;
  valor: string;
  cor?: string;
}) {
  return (
    <div className="cartao p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`text-xl font-bold tabular-nums ${cor}`}>{valor}</p>
    </div>
  );
}
