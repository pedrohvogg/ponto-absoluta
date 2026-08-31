import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { panoramaDoDia } from "@/lib/consultas";
import { diaBr, hojeStr, horaDe, limitesDoDia, minutosParaHoras } from "@/lib/datas";
import { obterConfig } from "@/lib/config";
import { EtiquetaSituacao } from "@/components/Etiquetas";

export const dynamic = "force-dynamic";

export default async function PainelAdmin({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const config = await obterConfig();
  const { dia: diaParam } = await searchParams;
  const dia = diaParam ?? hojeStr(config.fusoHorario);
  const ehHoje = dia === hojeStr(config.fusoHorario);

  const { inicio, fim } = limitesDoDia(dia, config.fusoHorario);

  const [{ linhas }, pendentes, bloqueios] = await Promise.all([
    panoramaDoDia(dia),
    prisma.solicitacao.count({ where: { status: "PENDENTE" } }),
    // Tentativas que NÃO viraram registro. Sem isso, quem foi barrado pela
    // cerca ou pelo reconhecimento facial fica invisível para o RH.
    prisma.auditoria.findMany({
      where: {
        acao: { in: ["PONTO_FORA_DA_CERCA", "FACE_RECUSADA"] },
        criadoEm: { gte: inicio, lt: fim },
      },
      orderBy: { criadoEm: "desc" },
      select: {
        id: true,
        acao: true,
        criadoEm: true,
        usuario: { select: { nome: true } },
      },
    }),
  ]);

  const trabalhando = linhas.filter((l) => l.situacao === "TRABALHANDO").length;
  const intervalo = linhas.filter((l) => l.situacao === "INTERVALO").length;
  const semRegistro = linhas.filter((l) => l.registros.length === 0 && l.jornada.diaUtil);
  const semBiometria = linhas.filter((l) => !l.temBiometria);
  const foraDaCerca = linhas.filter((l) => l.foraDaCerca);
  const atrasados = linhas.filter((l) => l.jornada.atrasoMinutos > 0);

  // Agrupa por pessoa: 5 tentativas do mesmo funcionário são um problema só.
  const porPessoa = new Map<string, { nome: string; tentativas: number; motivo: string; hora: string }>();
  for (const b of bloqueios) {
    const nome = b.usuario?.nome ?? "Desconhecido";
    const atual = porPessoa.get(nome);
    const motivo = b.acao === "PONTO_FORA_DA_CERCA" ? "fora do local" : "rosto não reconhecido";
    if (atual) {
      atual.tentativas += 1;
      if (!atual.motivo.includes(motivo)) atual.motivo += ` e ${motivo}`;
    } else {
      porPessoa.set(nome, {
        nome,
        tentativas: 1,
        motivo,
        hora: horaDe(b.criadoEm, config.fusoHorario),
      });
    }
  }
  const tentativasBloqueadas = [...porPessoa.values()];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Painel do dia</h1>
          <p className="text-sm text-slate-500">
            {diaBr(dia)}
            {ehHoje && " · atualizado agora"}
          </p>
        </div>
        <form className="flex items-end gap-2">
          <div>
            <label htmlFor="dia" className="rotulo text-xs">
              Ver outro dia
            </label>
            <input id="dia" type="date" name="dia" defaultValue={dia} className="campo py-1.5" />
          </div>
          <button className="botao-secundario py-2">Ver</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao titulo="Trabalhando agora" valor={trabalhando} cor="text-emerald-600" />
        <Cartao titulo="Em intervalo" valor={intervalo} cor="text-amber-600" />
        <Cartao
          titulo="Sem registro no dia"
          valor={semRegistro.length}
          cor={semRegistro.length ? "text-red-600" : "text-slate-900"}
        />
        <Cartao
          titulo="Ajustes pendentes"
          valor={pendentes}
          cor={pendentes ? "text-amber-600" : "text-slate-900"}
          href="/admin/ajustes"
        />
      </div>

      {tentativasBloqueadas.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4">
          <h3 className="text-sm font-semibold text-red-900">
            ⚠️ Não conseguiram bater o ponto ({tentativasBloqueadas.length})
          </h3>
          <p className="mt-0.5 text-xs text-red-800">
            Estas pessoas tentaram registrar e foram barradas. Se a tentativa foi legítima,
            lance o ponto manualmente em Registros.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-red-900">
            {tentativasBloqueadas.map((t) => (
              <li key={t.nome} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{t.nome}</span>
                <span className="text-xs">
                  {t.motivo} · {t.tentativas} tentativa(s) · última às {t.hora}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/admin/registros"
            className="mt-2 inline-block text-sm font-medium text-red-900 underline"
          >
            Lançar ponto manualmente →
          </Link>
        </div>
      )}

      {(semBiometria.length > 0 || foraDaCerca.length > 0 || atrasados.length > 0) && (
        <div className="grid gap-3 md:grid-cols-3">
          {semBiometria.length > 0 && (
            <Alerta
              titulo="Sem rosto cadastrado"
              itens={semBiometria.map((l) => l.funcionario.nome)}
              detalhe="Estes funcionários não conseguem bater o ponto."
              tom="amber"
            />
          )}
          {atrasados.length > 0 && (
            <Alerta
              titulo="Atrasos no dia"
              itens={atrasados.map(
                (l) => `${l.funcionario.nome} (+${minutosParaHoras(l.jornada.atrasoMinutos)})`,
              )}
              tom="slate"
            />
          )}
          {foraDaCerca.length > 0 && (
            <Alerta
              titulo="Registro fora do local"
              itens={foraDaCerca.map((l) => l.funcionario.nome)}
              detalhe="Bateram o ponto fora do raio permitido."
              tom="red"
            />
          )}
        </div>
      )}

      <div className="cartao overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-800">Funcionários ({linhas.length})</h2>
          <Link href="/admin/funcionarios" className="text-sm font-medium text-marca-700 hover:underline">
            Gerenciar →
          </Link>
        </div>

        {linhas.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-slate-500">Nenhum funcionário cadastrado ainda.</p>
            <Link href="/admin/funcionarios/novo" className="botao-primario mt-3">
              Cadastrar primeiro funcionário
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Funcionário</th>
                  <th className="px-4 py-2">Situação</th>
                  <th className="px-4 py-2">Batidas</th>
                  <th className="px-4 py-2 text-right">Trabalhado</th>
                  <th className="px-4 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhas.map((l) => (
                  <tr key={l.funcionario.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/funcionarios/${l.funcionario.id}`}
                        className="font-medium text-slate-800 hover:text-marca-700"
                      >
                        {l.funcionario.nome}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {l.funcionario.cargo ?? "—"} · mat. {l.funcionario.matricula}
                      </p>
                    </td>
                    <td className="px-4 py-2">
                      <EtiquetaSituacao situacao={l.situacao} />
                    </td>
                    <td className="px-4 py-2">
                      {l.registros.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className="font-mono text-xs tabular-nums text-slate-600">
                          {l.registros.map((r) => horaDe(r.momento, config.fusoHorario)).join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {minutosParaHoras(l.jornada.trabalhado)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono tabular-nums ${
                        l.jornada.saldo < 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {minutosParaHoras(l.jornada.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Cartao({
  titulo,
  valor,
  cor,
  href,
}: {
  titulo: string;
  valor: number;
  cor: string;
  href?: string;
}) {
  const conteudo = (
    <div className="cartao p-4 transition hover:shadow-md">
      <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${cor}`}>{valor}</p>
    </div>
  );
  return href ? <Link href={href}>{conteudo}</Link> : conteudo;
}

function Alerta({
  titulo,
  itens,
  detalhe,
  tom,
}: {
  titulo: string;
  itens: string[];
  detalhe?: string;
  tom: "amber" | "red" | "slate";
}) {
  const cores = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
    slate: "border-slate-200 bg-white text-slate-800",
  }[tom];

  return (
    <div className={`rounded-xl border p-4 ${cores}`}>
      <h3 className="text-sm font-semibold">
        {titulo} ({itens.length})
      </h3>
      {detalhe && <p className="mt-0.5 text-xs opacity-80">{detalhe}</p>}
      <ul className="mt-2 space-y-0.5 text-sm">
        {itens.slice(0, 5).map((i) => (
          <li key={i}>• {i}</li>
        ))}
        {itens.length > 5 && <li className="text-xs opacity-70">e mais {itens.length - 5}…</li>}
      </ul>
    </div>
  );
}
