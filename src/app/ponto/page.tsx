import Link from "next/link";
import { exigirFuncionario } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { obterConfig } from "@/lib/config";
import { diaBr, hojeStr, limitesDoDia, minutosParaHoras } from "@/lib/datas";
import { calcularJornada, proximoTipo } from "@/lib/jornada";
import Cabecalho from "@/components/Cabecalho";
import PainelPonto from "@/components/PainelPonto";

export const dynamic = "force-dynamic";

export default async function PaginaPonto() {
  const sessao = await exigirFuncionario();
  const config = await obterConfig();
  const dia = hojeStr(config.fusoHorario);
  const { inicio, fim } = limitesDoDia(dia, config.fusoHorario);

  const [usuario, registros, biometrias] = await Promise.all([
    prisma.usuario.findUniqueOrThrow({
      where: { id: sessao.id },
      select: {
        nome: true,
        matricula: true,
        cargaDiariaMinutos: true,
        entradaPrevista: true,
        saidaPrevista: true,
        diasSemana: true,
      },
    }),
    prisma.registro.findMany({
      where: { usuarioId: sessao.id, momento: { gte: inicio, lt: fim } },
      orderBy: { momento: "asc" },
      select: { id: true, tipo: true, momento: true, origem: true, dentroDaCerca: true },
    }),
    prisma.biometria.count({ where: { usuarioId: sessao.id } }),
  ]);

  const jornada = calcularJornada(dia, registros, usuario, {
    fuso: config.fusoHorario,
    toleranciaMinutos: config.toleranciaMinutos,
  });

  return (
    <>
      <Cabecalho sessao={sessao} nomeEmpresa={config.nomeEmpresa} />
      <main className="mx-auto max-w-3xl space-y-5 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Olá, {primeiroNome(usuario.nome)}</h1>
            <p className="text-sm text-slate-500">
              {diaBr(dia)} · Matrícula {usuario.matricula} · Jornada prevista{" "}
              {usuario.entradaPrevista}–{usuario.saidaPrevista}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Trabalhado hoje</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">
              {minutosParaHoras(jornada.trabalhado)}
            </p>
          </div>
        </div>

        {biometrias === 0 ? (
          <div className="cartao border-amber-200 bg-amber-50 p-5 text-center">
            <p className="text-3xl">📸</p>
            <h2 className="mt-2 font-semibold text-amber-900">Cadastre seu rosto primeiro</h2>
            <p className="mt-1 text-sm text-amber-800">
              O registro de ponto é validado por reconhecimento facial. Leva menos de um minuto.
            </p>
            <Link href="/minha-biometria" className="botao-primario mt-4">
              Cadastrar meu rosto
            </Link>
          </div>
        ) : (
          <PainelPonto
            tipoSugerido={proximoTipo(registros)}
            exigeLocalizacao={config.geofenceAtiva}
            salvarFoto={config.salvarFoto}
            registrosIniciais={registros.map((r) => ({
              id: r.id,
              tipo: r.tipo,
              momento: r.momento.toISOString(),
              origem: r.origem,
              dentroDaCerca: r.dentroDaCerca,
            }))}
            fuso={config.fusoHorario}
          />
        )}

        <div className="grid grid-cols-3 gap-3">
          <Indicador titulo="Entrada" valor={jornada.primeiraEntrada ?? "—"} />
          <Indicador titulo="Intervalo" valor={minutosParaHoras(jornada.intervalo)} />
          <Indicador
            titulo="Saldo do dia"
            valor={minutosParaHoras(jornada.saldo)}
            cor={jornada.saldo >= 0 ? "text-emerald-600" : "text-red-600"}
          />
        </div>

        <Link
          href="/meus-registros"
          className="block rounded-xl border border-slate-200 bg-white p-4 text-center text-sm font-medium text-marca-700 shadow-sm hover:bg-slate-50"
        >
          Ver meu histórico e solicitar ajustes →
        </Link>
      </main>
    </>
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
    <div className="cartao p-3 text-center">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className={`text-lg font-bold tabular-nums ${cor}`}>{valor}</p>
    </div>
  );
}

function primeiroNome(nome: string) {
  return nome.split(" ")[0];
}
