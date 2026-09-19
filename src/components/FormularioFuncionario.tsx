"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cargaSugerida, type HorarioSimples } from "@/lib/escala";
import { minutosParaHoras } from "@/lib/datas";

export type DadosFuncionario = {
  id?: string;
  nome: string;
  email: string;
  matricula: string;
  cargo: string;
  departamento: string;
  papel: "ADMIN" | "FUNCIONARIO" | "TOTEM";
  admissaoEm: string | null;
  cargaDiariaMinutos: number;
  entradaPrevista: string;
  saidaPrevista: string;
  intervaloMinutos: number;
  diasSemana: number[];
  horarios: HorarioSimples[];
};

const DIAS = [
  { n: 1, r: "Seg" },
  { n: 2, r: "Ter" },
  { n: 3, r: "Qua" },
  { n: 4, r: "Qui" },
  { n: 5, r: "Sex" },
  { n: 6, r: "Sáb" },
  { n: 0, r: "Dom" },
];

const PADRAO: DadosFuncionario = {
  nome: "",
  email: "",
  matricula: "",
  cargo: "",
  departamento: "",
  papel: "FUNCIONARIO",
  admissaoEm: null,
  cargaDiariaMinutos: 480,
  entradaPrevista: "08:00",
  saidaPrevista: "17:00",
  intervaloMinutos: 60,
  diasSemana: [1, 2, 3, 4, 5],
  horarios: [],
};

export default function FormularioFuncionario({
  inicial,
  modo,
}: {
  inicial?: DadosFuncionario;
  modo: "criar" | "editar";
}) {
  const router = useRouter();
  const [dados, setDados] = useState<DadosFuncionario>(inicial ?? PADRAO);
  // Quem bate ponto só pelo totem não precisa de e-mail nem senha. Ao editar,
  // já vem marcado se a pessoa tiver e-mail cadastrado.
  const [comLogin, setComLogin] = useState(Boolean(inicial?.email));
  // Só entra no modo por dia quem já tem horários gravados; os demais seguem
  // no padrão de sempre, sem precisar reconferir sete linhas.
  const [porDia, setPorDia] = useState((inicial?.horarios?.length ?? 0) > 0);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);
  const [criado, setCriado] = useState(false);

  // Administrador e totem entram no sistema; funcionário só se você quiser.
  const precisaEmail = comLogin || dados.papel !== "FUNCIONARIO";

  function definir<K extends keyof DadosFuncionario>(campo: K, valor: DadosFuncionario[K]) {
    setDados((d) => ({ ...d, [campo]: valor }));
    setSalvo(false);
  }

  function alternarDia(n: number) {
    setDados((d) => ({
      ...d,
      diasSemana: d.diasSemana.includes(n)
        ? d.diasSemana.filter((x) => x !== n)
        : [...d.diasSemana, n].sort(),
    }));
    setSalvo(false);
  }

  /** Horário do dia já materializado, partindo do padrão quando não existe. */
  function horarioDe(n: number): HorarioSimples {
    return (
      dados.horarios.find((h) => h.diaSemana === n) ?? {
        diaSemana: n,
        trabalha: dados.diasSemana.includes(n),
        entrada: dados.entradaPrevista,
        saida: dados.saidaPrevista,
        intervaloMinutos: dados.intervaloMinutos,
        cargaMinutos: dados.diasSemana.includes(n) ? dados.cargaDiariaMinutos : 0,
      }
    );
  }

  /** Ao ligar o modo por dia, a semana nasce igual ao padrão já cadastrado. */
  function alternarPorDia(ligado: boolean) {
    setPorDia(ligado);
    setSalvo(false);
    if (ligado && dados.horarios.length === 0) {
      setDados((d) => ({ ...d, horarios: DIAS.map((x) => horarioDe(x.n)) }));
    }
  }

  function definirHorario(n: number, mudanca: Partial<HorarioSimples>) {
    setDados((d) => {
      const base = d.horarios.length ? d.horarios : DIAS.map((x) => horarioDe(x.n));
      return {
        ...d,
        horarios: base.map((h) => {
          if (h.diaSemana !== n) return h;
          const novo = { ...h, ...mudanca };
          // Mexeu no relógio: a carga acompanha, a menos que o usuário a edite
          // diretamente logo em seguida.
          if (
            mudanca.entrada !== undefined ||
            mudanca.saida !== undefined ||
            mudanca.intervaloMinutos !== undefined
          ) {
            novo.cargaMinutos = cargaSugerida(novo.entrada, novo.saida, novo.intervaloMinutos);
          }
          if (mudanca.trabalha === false) novo.cargaMinutos = 0;
          if (mudanca.trabalha === true && novo.cargaMinutos === 0) {
            novo.cargaMinutos = cargaSugerida(novo.entrada, novo.saida, novo.intervaloMinutos);
          }
          return novo;
        }),
      };
    });
    setSalvo(false);
  }

  function totalSemanal(): string {
    const base = dados.horarios.length ? dados.horarios : DIAS.map((x) => horarioDe(x.n));
    return minutosParaHoras(
      base.reduce((t, h) => t + (h.trabalha ? h.cargaMinutos : 0), 0),
    );
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const url =
        modo === "criar" ? "/api/admin/funcionarios" : `/api/admin/funcionarios/${inicial?.id}`;
      const resposta = await fetch(url, {
        method: modo === "criar" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...dados,
          email: precisaEmail ? dados.email : "",
          cargo: dados.cargo || null,
          departamento: dados.departamento || null,
          admissaoEm: dados.admissaoEm || null,
          // Lista vazia apaga os horários por dia e devolve a pessoa ao padrão.
          horarios: porDia ? DIAS.map((d) => horarioDe(d.n)) : [],
        }),
      });
      const resultado = await resposta.json();
      if (!resposta.ok) {
        setErro(resultado.erro ?? "Não foi possível salvar.");
        return;
      }
      if (modo === "criar") {
        // Sem login, não há senha para entregar: mostramos a confirmação simples.
        setSenhaGerada(resultado.senhaProvisoria ?? "");
        setCriado(true);
      } else {
        setSalvo(true);
        router.refresh();
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (criado && inicial === undefined) {
    const temSenha = Boolean(senhaGerada);
    return (
      <div className="cartao border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="text-3xl">{temSenha ? "🔑" : "✅"}</p>
        <h2 className="mt-2 text-lg font-bold text-emerald-900">
          {temSenha ? "Acesso criado" : "Funcionário cadastrado"}
        </h2>
        <p className="mt-1 text-sm text-emerald-800">
          {temSenha ? (
            <>
              Entregue estes dados a <strong>{dados.nome}</strong>. A senha provisória{" "}
              <strong>não poderá ser vista novamente</strong> — no primeiro acesso o sistema exige
              a troca.
            </>
          ) : (
            <>
              <strong>{dados.nome}</strong> já pode bater ponto no totem. Falta apenas cadastrar o
              rosto: leve a pessoa até o tablet, ou use o botão de cadastro facial na ficha dela.
            </>
          )}
        </p>
        <dl className="mx-auto mt-4 max-w-sm space-y-2 text-left">
          <div className="rounded-lg bg-white p-3">
            <dt className="text-xs uppercase text-slate-500">
              {temSenha ? "E-mail / matrícula" : "Matrícula"}
            </dt>
            <dd className="font-mono text-sm">
              {temSenha ? `${dados.email} · ${dados.matricula}` : dados.matricula}
            </dd>
          </div>
          {temSenha && (
            <div className="rounded-lg bg-white p-3">
              <dt className="text-xs uppercase text-slate-500">Senha provisória</dt>
              <dd className="font-mono text-xl font-bold tracking-wider">{senhaGerada}</dd>
            </div>
          )}
        </dl>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {temSenha && (
            <button
              onClick={() => navigator.clipboard?.writeText(`${dados.email} / ${senhaGerada}`)}
              className="botao-secundario"
            >
              Copiar dados
            </button>
          )}
          <button
            onClick={() => {
              setSenhaGerada(null);
              setCriado(false);
              setDados(PADRAO);
            }}
            className="botao-secundario"
          >
            Cadastrar outro
          </button>
          <button onClick={() => router.push("/admin/funcionarios")} className="botao-primario">
            Concluir
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      <section className="cartao p-4">
        <h2 className="mb-3 font-semibold text-slate-800">Dados do funcionário</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="nome" className="rotulo">
              Nome completo *
            </label>
            <input
              id="nome"
              className="campo"
              required
              value={dados.nome}
              onChange={(e) => definir("nome", e.target.value)}
            />
          </div>
          {precisaEmail ? (
            <div>
              <label htmlFor="email" className="rotulo">
                E-mail de acesso *
              </label>
              <input
                id="email"
                type="email"
                className="campo"
                required
                value={dados.email}
                onChange={(e) => definir("email", e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                {dados.papel === "TOTEM"
                  ? "É com este e-mail que você entra no tablet da loja."
                  : dados.papel === "ADMIN"
                    ? "Administradores precisam de e-mail para entrar."
                    : "O sistema gera uma senha provisória ao salvar."}
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              Sem login próprio: esta pessoa bate ponto apenas no totem da loja, sendo
              reconhecida pelo rosto. Quem consulta o espelho de ponto dela é você.
            </div>
          )}
          <div>
            <label htmlFor="matricula" className="rotulo">
              Matrícula *
            </label>
            <input
              id="matricula"
              className="campo"
              required
              value={dados.matricula}
              onChange={(e) => definir("matricula", e.target.value)}
              placeholder="ex.: 1042"
            />
          </div>
          <div>
            <label htmlFor="cargo" className="rotulo">
              Cargo
            </label>
            <input
              id="cargo"
              className="campo"
              value={dados.cargo}
              onChange={(e) => definir("cargo", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="departamento" className="rotulo">
              Setor
            </label>
            <input
              id="departamento"
              className="campo"
              value={dados.departamento}
              onChange={(e) => definir("departamento", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="papel" className="rotulo">
              Tipo de acesso
            </label>
            <select
              id="papel"
              className="campo"
              value={dados.papel}
              onChange={(e) => definir("papel", e.target.value as DadosFuncionario["papel"])}
            >
              <option value="FUNCIONARIO">Funcionário (bate ponto)</option>
              <option value="ADMIN">Administrador (gerencia o sistema)</option>
              <option value="TOTEM">Totem (tablet fixo na loja)</option>
            </select>
          </div>

          {dados.papel === "FUNCIONARIO" && (
            <div className="md:col-span-2">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={comLogin}
                  onChange={(e) => setComLogin(e.target.checked)}
                />
                <span>
                  Dar acesso próprio (login por e-mail no celular)
                  <span className="block text-xs text-slate-500">
                    Opcional. Serve para a pessoa consultar o próprio espelho de ponto e pedir
                    ajuste de batidas. Bater ponto no totem funciona sem isso.
                  </span>
                </span>
              </label>
            </div>
          )}
        </div>
      </section>

      <section className="cartao p-4">
        <h2 className="mb-1 font-semibold text-slate-800">Jornada</h2>
        <p className="mb-3 text-xs text-slate-500">
          Usada para calcular atrasos, horas extras e saldo do banco de horas.
        </p>

        <div className="mb-4 max-w-xs">
          <label htmlFor="admissao" className="rotulo">
            Data de admissão
          </label>
          <input
            id="admissao"
            type="date"
            className="campo"
            value={dados.admissaoEm ?? ""}
            onChange={(e) => definir("admissaoEm", e.target.value || null)}
          />
          <p className="mt-1 text-xs text-slate-500">
            Dias anteriores a esta data não entram como falta no relatório. Em branco, o período
            pedido é cobrado inteiro.
          </p>
        </div>

        <label className="mb-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={porDia}
            onChange={(e) => alternarPorDia(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium text-slate-800">Horário diferente por dia da semana</span>
            <span className="block text-xs text-slate-500">
              Marque quando o expediente muda ao longo da semana — sábado mais curto, por exemplo.
            </span>
          </span>
        </label>

        {porDia ? (
          <div className="space-y-2">
            {DIAS.map((d) => {
              const h = horarioDe(d.n);
              return (
                <div
                  key={d.n}
                  className={`grid items-center gap-2 rounded-lg border p-2 sm:grid-cols-[6rem_1fr_1fr_1fr_1fr] ${
                    h.trabalha ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={h.trabalha}
                      onChange={(e) => definirHorario(d.n, { trabalha: e.target.checked })}
                    />
                    {d.r}
                  </label>
                  {h.trabalha ? (
                    <>
                      <Campo rotulo="Entrada">
                        <input
                          type="time"
                          className="campo py-1.5 text-sm"
                          value={h.entrada}
                          onChange={(e) => definirHorario(d.n, { entrada: e.target.value })}
                        />
                      </Campo>
                      <Campo rotulo="Saída">
                        <input
                          type="time"
                          className="campo py-1.5 text-sm"
                          value={h.saida}
                          onChange={(e) => definirHorario(d.n, { saida: e.target.value })}
                        />
                      </Campo>
                      <Campo rotulo="Intervalo (min)">
                        <input
                          type="number"
                          min={0}
                          max={480}
                          className="campo py-1.5 text-sm"
                          value={h.intervaloMinutos}
                          onChange={(e) =>
                            definirHorario(d.n, { intervaloMinutos: Number(e.target.value) })
                          }
                        />
                      </Campo>
                      <Campo rotulo="Carga (min)">
                        <input
                          type="number"
                          min={0}
                          max={1440}
                          className="campo py-1.5 text-sm"
                          value={h.cargaMinutos}
                          onChange={(e) =>
                            definirHorario(d.n, { cargaMinutos: Number(e.target.value) })
                          }
                        />
                      </Campo>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500 sm:col-span-4">Folga</p>
                  )}
                </div>
              );
            })}
            <p className="pt-1 text-xs text-slate-500">
              Total previsto na semana: <strong>{totalSemanal()}</strong>. A carga é sugerida pelo
              relógio quando você muda entrada, saída ou intervalo, mas continua editável — jornada
              contratada nem sempre bate com o horário da porta.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label htmlFor="entrada" className="rotulo">
                  Entrada
                </label>
                <input
                  id="entrada"
                  type="time"
                  className="campo"
                  value={dados.entradaPrevista}
                  onChange={(e) => definir("entradaPrevista", e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="saida" className="rotulo">
                  Saída
                </label>
                <input
                  id="saida"
                  type="time"
                  className="campo"
                  value={dados.saidaPrevista}
                  onChange={(e) => definir("saidaPrevista", e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="intervalo" className="rotulo">
                  Intervalo (min)
                </label>
                <input
                  id="intervalo"
                  type="number"
                  min={0}
                  max={480}
                  className="campo"
                  value={dados.intervaloMinutos}
                  onChange={(e) => definir("intervaloMinutos", Number(e.target.value))}
                />
              </div>
              <div>
                <label htmlFor="carga" className="rotulo">
                  Carga diária (min)
                </label>
                <input
                  id="carga"
                  type="number"
                  min={0}
                  max={1440}
                  step={30}
                  className="campo"
                  value={dados.cargaDiariaMinutos}
                  onChange={(e) => definir("cargaDiariaMinutos", Number(e.target.value))}
                />
                <p className="mt-1 text-xs text-slate-500">
                  {Math.floor(dados.cargaDiariaMinutos / 60)}h
                  {String(dados.cargaDiariaMinutos % 60).padStart(2, "0")} por dia
                </p>
              </div>
            </div>

            <div className="mt-4">
              <span className="rotulo">Dias de trabalho</span>
              <div className="flex flex-wrap gap-2">
                {DIAS.map((d) => (
                  <button
                    key={d.n}
                    type="button"
                    onClick={() => alternarDia(d.n)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                      dados.diasSemana.includes(d.n)
                        ? "border-marca-500 bg-marca-50 text-marca-800"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {d.r}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      {salvo && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Alterações salvas.
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="botao-primario" disabled={enviando}>
          {enviando ? "Salvando…" : modo === "criar" ? "Criar acesso" : "Salvar alterações"}
        </button>
        <button type="button" onClick={() => router.back()} className="botao-secundario">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Rótulo curto acima de um campo da grade de horários. */
function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] uppercase tracking-wide text-slate-400">
        {rotulo}
      </span>
      {children}
    </label>
  );
}
