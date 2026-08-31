import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  diaDe,
  horaDe,
  intervaloDeDias,
  limitesDoDia,
  limitesDoMes,
  minutosParaHoras,
  paraUtc,
  somaDias,
} from "../src/lib/datas";
import { calcularJornada, proximoTipo, situacaoAtual, totalizar, validarSequencia } from "../src/lib/jornada";
import { dentroDaCerca, distanciaMetros, MARGEM_GPS_MAXIMA } from "../src/lib/geo";
import {
  descriptorValido,
  distanciaEuclidiana,
  identificar,
  melhorDistancia,
} from "../src/lib/face";
import { decidirRota, telaInicial, type Sessao } from "../src/lib/rotas";

const FUSO = "America/Sao_Paulo";
const JORNADA_PADRAO = {
  cargaDiariaMinutos: 480,
  entradaPrevista: "08:00",
  diasSemana: [1, 2, 3, 4, 5],
};
const OPCOES = { fuso: FUSO, toleranciaMinutos: 10 };

/** Ajuda a montar batidas no fuso da empresa. */
function batida(tipo: "ENTRADA" | "INICIO_INTERVALO" | "FIM_INTERVALO" | "SAIDA", dia: string, hora: string) {
  return { tipo, momento: paraUtc(dia, hora, FUSO) } as const;
}

describe("datas — conversão de fuso", () => {
  it("converte hora local para UTC no horário padrão de Brasília (UTC-3)", () => {
    const utc = paraUtc("2026-08-13", "08:00", FUSO);
    assert.equal(utc.toISOString(), "2026-08-13T11:00:00.000Z");
  });

  it("faz o caminho de volta preservando dia e hora", () => {
    const utc = paraUtc("2026-08-13", "23:30", FUSO);
    assert.equal(diaDe(utc, FUSO), "2026-08-13");
    assert.equal(horaDe(utc, FUSO), "23:30");
  });

  it("mantém a competência correta para batidas depois da meia-noite UTC", () => {
    // 22h em São Paulo já é o dia seguinte em UTC.
    const utc = paraUtc("2026-08-13", "22:00", FUSO);
    assert.equal(utc.toISOString(), "2026-08-14T01:00:00.000Z");
    assert.equal(diaDe(utc, FUSO), "2026-08-13");
  });

  it("delimita o dia local em 24 horas", () => {
    const { inicio, fim } = limitesDoDia("2026-08-13", FUSO);
    assert.equal(inicio.toISOString(), "2026-08-13T03:00:00.000Z");
    assert.equal(fim.toISOString(), "2026-08-14T03:00:00.000Z");
  });

  it("formata minutos como HH:mm, inclusive negativos", () => {
    assert.equal(minutosParaHoras(495), "08:15");
    assert.equal(minutosParaHoras(-30), "-00:30");
    assert.equal(minutosParaHoras(0), "00:00");
  });

  it("navega entre dias e meses", () => {
    assert.equal(somaDias("2026-02-28", 1), "2026-03-01");
    assert.equal(somaDias("2026-01-01", -1), "2025-12-31");
    assert.deepEqual(limitesDoMes("2026-02-10"), { de: "2026-02-01", ate: "2026-02-28" });
    assert.equal(intervaloDeDias("2026-08-01", "2026-08-31").length, 31);
  });
});

describe("jornada — cálculo do dia", () => {
  it("soma o tempo trabalhado descontando o intervalo", () => {
    const j = calcularJornada(
      "2026-08-13",
      [
        batida("ENTRADA", "2026-08-13", "08:00"),
        batida("INICIO_INTERVALO", "2026-08-13", "12:00"),
        batida("FIM_INTERVALO", "2026-08-13", "13:00"),
        batida("SAIDA", "2026-08-13", "17:00"),
      ],
      JORNADA_PADRAO,
      OPCOES,
    );
    assert.equal(j.trabalhado, 480);
    assert.equal(j.intervalo, 60);
    assert.equal(j.saldo, 0);
    assert.equal(j.emAndamento, false);
    assert.equal(j.inconsistente, false);
    assert.equal(j.primeiraEntrada, "08:00");
    assert.equal(j.ultimaSaida, "17:00");
  });

  it("apura horas extras", () => {
    const j = calcularJornada(
      "2026-08-13",
      [batida("ENTRADA", "2026-08-13", "08:00"), batida("SAIDA", "2026-08-13", "18:30")],
      JORNADA_PADRAO,
      OPCOES,
    );
    assert.equal(j.trabalhado, 630);
    assert.equal(j.extras, 150);
    assert.equal(j.devendo, 0);
  });

  it("respeita a tolerância antes de marcar atraso", () => {
    const noLimite = calcularJornada(
      "2026-08-13",
      [batida("ENTRADA", "2026-08-13", "08:10")],
      JORNADA_PADRAO,
      OPCOES,
    );
    assert.equal(noLimite.atrasoMinutos, 0);

    const atrasado = calcularJornada(
      "2026-08-13",
      [batida("ENTRADA", "2026-08-13", "08:25")],
      JORNADA_PADRAO,
      OPCOES,
    );
    assert.equal(atrasado.atrasoMinutos, 25);
  });

  it("não aponta atraso em dia sem entrada registrada", () => {
    // Só a saída foi batida: não há hora de entrada para comparar.
    const j = calcularJornada(
      "2026-08-10",
      [batida("SAIDA", "2026-08-10", "18:00")],
      JORNADA_PADRAO,
      OPCOES,
    );
    assert.equal(j.atrasoMinutos, 0);
    assert.equal(j.primeiraEntrada, null);
    assert.equal(j.inconsistente, true);
  });

  it("não gera tempo fantasma quando falta a saída", () => {
    const j = calcularJornada(
      "2026-08-13",
      [batida("ENTRADA", "2026-08-13", "08:00")],
      JORNADA_PADRAO,
      OPCOES,
    );
    assert.equal(j.trabalhado, 0);
    assert.equal(j.emAndamento, true);
    assert.equal(j.devendo, 480);
  });

  it("sinaliza sequência inconsistente com duas entradas seguidas", () => {
    const j = calcularJornada(
      "2026-08-13",
      [batida("ENTRADA", "2026-08-13", "08:00"), batida("ENTRADA", "2026-08-13", "09:00")],
      JORNADA_PADRAO,
      OPCOES,
    );
    assert.equal(j.inconsistente, true);
  });

  it("ordena batidas fora de ordem antes de calcular", () => {
    const j = calcularJornada(
      "2026-08-13",
      [batida("SAIDA", "2026-08-13", "17:00"), batida("ENTRADA", "2026-08-13", "09:00")],
      JORNADA_PADRAO,
      OPCOES,
    );
    assert.equal(j.trabalhado, 480);
    assert.equal(j.inconsistente, false);
  });

  it("não cobra jornada em dia não útil", () => {
    // 2026-08-15 é um sábado.
    const j = calcularJornada("2026-08-15", [], JORNADA_PADRAO, OPCOES);
    assert.equal(j.diaUtil, false);
    assert.equal(j.previsto, 0);
    assert.equal(j.saldo, 0);
  });

  it("conta como extra o trabalho em dia não útil", () => {
    const j = calcularJornada(
      "2026-08-15",
      [batida("ENTRADA", "2026-08-15", "09:00"), batida("SAIDA", "2026-08-15", "13:00")],
      JORNADA_PADRAO,
      OPCOES,
    );
    assert.equal(j.extras, 240);
  });

  it("totaliza um período", () => {
    const dias = ["2026-08-10", "2026-08-11"].map((d) =>
      calcularJornada(
        d,
        [batida("ENTRADA", d, "08:00"), batida("SAIDA", d, "17:00")],
        JORNADA_PADRAO,
        OPCOES,
      ),
    );
    const t = totalizar(dias);
    assert.equal(t.trabalhado, 1080);
    assert.equal(t.previsto, 960);
    assert.equal(t.saldo, 120);
    assert.equal(t.diasTrabalhados, 2);
  });
});

describe("jornada — sequência de batidas", () => {
  it("sugere a próxima batida", () => {
    assert.equal(proximoTipo([]), "ENTRADA");
    assert.equal(proximoTipo([batida("ENTRADA", "2026-08-13", "08:00")]), "INICIO_INTERVALO");
    assert.equal(
      proximoTipo([
        batida("ENTRADA", "2026-08-13", "08:00"),
        batida("INICIO_INTERVALO", "2026-08-13", "12:00"),
      ]),
      "FIM_INTERVALO",
    );
  });

  it("bloqueia transições impossíveis", () => {
    assert.equal(validarSequencia(null, "ENTRADA"), null);
    assert.notEqual(validarSequencia(null, "SAIDA"), null);
    assert.notEqual(validarSequencia("ENTRADA", "ENTRADA"), null);
    assert.notEqual(validarSequencia("ENTRADA", "FIM_INTERVALO"), null);
    assert.equal(validarSequencia("INICIO_INTERVALO", "FIM_INTERVALO"), null);
    assert.notEqual(validarSequencia("INICIO_INTERVALO", "SAIDA"), null);
    assert.equal(validarSequencia("SAIDA", "ENTRADA"), null);
  });

  it("descreve a situação atual", () => {
    assert.equal(situacaoAtual([]), "FORA");
    assert.equal(situacaoAtual([batida("ENTRADA", "2026-08-13", "08:00")]), "TRABALHANDO");
    assert.equal(
      situacaoAtual([
        batida("ENTRADA", "2026-08-13", "08:00"),
        batida("INICIO_INTERVALO", "2026-08-13", "12:00"),
      ]),
      "INTERVALO",
    );
  });
});

describe("geolocalização", () => {
  it("mede 1 grau de latitude como ~111,2 km", () => {
    const d = distanciaMetros(-23.5, -46.6, -22.5, -46.6);
    assert.ok(Math.abs(d - 111195) < 500, `esperava ~111,2 km, veio ${d} m`);
  });

  it("encurta 1 grau de longitude pelo cosseno da latitude", () => {
    // Na latitude de São Paulo (~23,5°), 1° de longitude ≈ 111,2 km × cos(23,5°).
    const esperado = 111195 * Math.cos((23.5 * Math.PI) / 180);
    const d = distanciaMetros(-23.5, -46.6, -23.5, -45.6);
    assert.ok(Math.abs(d - esperado) < 500, `esperava ~${Math.round(esperado)} m, veio ${d} m`);
  });

  it("mede distâncias curtas no tamanho de uma cerca virtual", () => {
    // 0,001° de latitude ≈ 111 m — a ordem de grandeza usada no geofence.
    const d = distanciaMetros(-23.5, -46.6, -23.501, -46.6);
    assert.ok(d > 105 && d < 118, `esperava ~111 m, veio ${d} m`);
  });

  it("devolve zero para o mesmo ponto", () => {
    assert.equal(distanciaMetros(-23.5, -46.6, -23.5, -46.6), 0);
  });
});

describe("cerca virtual", () => {
  const RAIO = 150;

  it("aceita quem está dentro do raio", () => {
    assert.equal(dentroDaCerca(0, RAIO, 10), true);
    assert.equal(dentroDaCerca(100, RAIO, 10), true);
    assert.equal(dentroDaCerca(RAIO, RAIO, 0), true);
  });

  it("bloqueia quem está fora do raio", () => {
    assert.equal(dentroDaCerca(RAIO + 1, RAIO, 0), false);
    assert.equal(dentroDaCerca(5000, RAIO, 10), false);
  });

  it("desconta a imprecisão do GPS a favor do funcionário", () => {
    // 200 m de distância com ±80 m de erro: pode estar a 120 m, dentro do raio.
    assert.equal(dentroDaCerca(200, RAIO, 80), true);
  });

  it("limita a margem do GPS para que não seja usada como brecha", () => {
    // A precisão vem do navegador e poderia ser forjada; o teto impede que
    // declarar um erro enorme libere a batida de qualquer lugar.
    assert.equal(dentroDaCerca(5000, RAIO, 99999), false);
    assert.equal(dentroDaCerca(RAIO + MARGEM_GPS_MAXIMA, RAIO, 99999), true);
    assert.equal(dentroDaCerca(RAIO + MARGEM_GPS_MAXIMA + 1, RAIO, 99999), false);
  });

  it("trata precisão ausente ou negativa como zero", () => {
    assert.equal(dentroDaCerca(200, RAIO, null), false);
    assert.equal(dentroDaCerca(200, RAIO, undefined), false);
    assert.equal(dentroDaCerca(200, RAIO, -500), false);
    assert.equal(dentroDaCerca(100, RAIO, -500), true);
  });
});

describe("comparação facial", () => {
  const base = Array.from({ length: 128 }, (_, i) => Math.sin(i) / 4);

  it("valida o formato do descriptor", () => {
    assert.equal(descriptorValido(base), true);
    assert.equal(descriptorValido(base.slice(0, 100)), false);
    assert.equal(descriptorValido("nao é array"), false);
    assert.equal(descriptorValido([...base.slice(1), Number.NaN]), false);
  });

  it("dá distância zero para o mesmo rosto", () => {
    assert.equal(distanciaEuclidiana(base, base), 0);
  });

  it("escolhe a biometria mais próxima entre as cadastradas", () => {
    const parecido = base.map((v) => v + 0.01);
    const diferente = base.map((v) => v + 0.5);
    const melhor = melhorDistancia(base, [diferente, parecido]);
    assert.ok(melhor !== null && melhor < 0.2, `esperava distância pequena, veio ${melhor}`);
  });

  it("reprova rosto distante do cadastrado", () => {
    const outro = base.map((v, i) => v + (i % 2 ? 0.4 : -0.4));
    const d = melhorDistancia(outro, [base]);
    assert.ok(d !== null && d > 0.5, `esperava distância grande, veio ${d}`);
  });
});

describe("identificação no totem (1:N)", () => {
  const LIMIAR = 0.45;
  const MARGEM = 0.06;

  /** Rostos sintéticos bem distintos entre si. */
  const rosto = (semente: number) =>
    Array.from({ length: 128 }, (_, i) => Math.sin(semente * 7.3 + i * 1.7) / 3);
  /** Mesma pessoa em outra iluminação: pequena variação no vetor. */
  const variacao = (d: number[], escala: number) =>
    d.map((v, i) => v + Math.sin(i * 3.1) * escala);

  const ana = rosto(1);
  const bruno = rosto(2);
  const carla = rosto(3);
  const equipe = [
    { referencia: "Ana", descriptors: [ana] },
    { referencia: "Bruno", descriptors: [bruno] },
    { referencia: "Carla", descriptors: [carla] },
  ];

  it("identifica a pessoa certa entre vários cadastrados", () => {
    const r = identificar(variacao(bruno, 0.002), equipe, LIMIAR, MARGEM);
    assert.equal(r.situacao, "IDENTIFICADO");
    if (r.situacao === "IDENTIFICADO") assert.equal(r.referencia, "Bruno");
  });

  it("reconhece a pessoa por qualquer uma de suas capturas", () => {
    // Ana cadastrou dois rostos; o segundo é o que aparece na câmera.
    const anaDeOculos = variacao(ana, 0.2);
    const comDuas = [
      { referencia: "Ana", descriptors: [ana, anaDeOculos] },
      { referencia: "Bruno", descriptors: [bruno] },
    ];
    const r = identificar(variacao(anaDeOculos, 0.001), comDuas, LIMIAR, MARGEM);
    assert.equal(r.situacao, "IDENTIFICADO");
    if (r.situacao === "IDENTIFICADO") assert.equal(r.referencia, "Ana");
  });

  it("recusa quem não está cadastrado em vez de chutar o mais parecido", () => {
    const visitante = rosto(99);
    const r = identificar(visitante, equipe, LIMIAR, MARGEM);
    assert.equal(r.situacao, "DESCONHECIDO");
  });

  it("pede a matrícula quando dois funcionários ficam parecidos demais", () => {
    // Dois cadastros quase idênticos: nenhum se destaca o suficiente.
    const gemeo = variacao(ana, 0.01);
    const comGemeos = [
      { referencia: "Ana", descriptors: [ana] },
      { referencia: "Irmã da Ana", descriptors: [gemeo] },
    ];
    const r = identificar(variacao(ana, 0.005), comGemeos, LIMIAR, MARGEM);
    assert.equal(r.situacao, "AMBIGUO");
  });

  it("não exige margem quando só há uma pessoa cadastrada", () => {
    const r = identificar(variacao(ana, 0.002), [{ referencia: "Ana", descriptors: [ana] }], LIMIAR, MARGEM);
    assert.equal(r.situacao, "IDENTIFICADO");
  });

  it("devolve DESCONHECIDO quando ninguém tem rosto cadastrado", () => {
    const r = identificar(ana, [], LIMIAR, MARGEM);
    assert.equal(r.situacao, "DESCONHECIDO");
    if (r.situacao === "DESCONHECIDO") assert.equal(r.melhorDistancia, null);
  });

  it("é mais rigoroso que a conferência 1:1", () => {
    // Uma variação grande passa no limiar 1:1 (0.5) mas não no do totem (0.45).
    const distante = variacao(ana, 0.055);
    const d = melhorDistancia(distante, [ana]);
    assert.ok(d !== null && d > LIMIAR && d < 0.5, `distância fora da faixa do teste: ${d}`);
    const r = identificar(distante, equipe, LIMIAR, MARGEM);
    assert.equal(r.situacao, "DESCONHECIDO");
  });
});

describe("rotas — navegação sem laço", () => {
  const TOTEM_NOVO = { papel: "TOTEM", trocarSenha: true, termoAceito: true };
  const TOTEM = { papel: "TOTEM", trocarSenha: false, termoAceito: true };
  const FUNC_NOVO = { papel: "FUNCIONARIO", trocarSenha: true, termoAceito: false };
  const FUNC_SEM_TERMO = { papel: "FUNCIONARIO", trocarSenha: false, termoAceito: false };
  const FUNC = { papel: "FUNCIONARIO", trocarSenha: false, termoAceito: true };
  const ADMIN = { papel: "ADMIN", trocarSenha: false, termoAceito: true };

  const PAGINAS = ["/", "/admin", "/totem", "/ponto", "/trocar-senha", "/termos", "/login"];

  /**
   * Segue os redirecionamentos como o navegador faria e devolve onde parou.
   * Estoura se um caminho se repetir — que e exatamente o ERR_TOO_MANY_REDIRECTS.
   */
  function navegar(inicio: string, sessao: Sessao | null): string {
    const trilha = [inicio];
    let atual = inicio;
    for (let i = 0; i < 10; i++) {
      const d = decidirRota(atual, sessao);
      if (d.tipo !== "redireciona") return atual;
      atual = d.destino;
      assert.ok(!trilha.includes(atual), `laço de redirecionamento: ${[...trilha, atual].join(" → ")}`);
      trilha.push(atual);
    }
    assert.fail(`redirecionamentos demais: ${trilha.join(" → ")}`);
  }

  for (const [nome, sessao] of [
    ["totem com senha provisória", TOTEM_NOVO],
    ["totem", TOTEM],
    ["funcionário com senha provisória", FUNC_NOVO],
    ["funcionário sem termo aceito", FUNC_SEM_TERMO],
    ["funcionário", FUNC],
    ["administrador", ADMIN],
    ["visitante sem sessão", null],
  ] as const) {
    it(`nenhuma página entra em laço para ${nome}`, () => {
      for (const pagina of PAGINAS) navegar(pagina, sessao);
    });
  }

  it("totem com senha provisória para na troca de senha, não no quiosque", () => {
    // O caso que quebrou em produção: o portão de senha mandava para
    // /trocar-senha e a regra de área devolvia para /totem, sem parar.
    assert.equal(navegar("/trocar-senha", TOTEM_NOVO), "/trocar-senha");
    assert.equal(navegar("/totem", TOTEM_NOVO), "/trocar-senha");
    assert.equal(navegar("/", TOTEM_NOVO), "/trocar-senha");
  });

  it("cada papel cai na sua área depois de passar pelos portões", () => {
    // A raiz não é área de ninguém: o middleware a libera e a própria página
    // manda cada um para telaInicial(). A exceção é o totem, que o middleware
    // já prende no quiosque antes de a página abrir.
    assert.equal(navegar("/", ADMIN), "/");
    assert.equal(navegar("/", FUNC), "/");
    assert.equal(navegar("/", TOTEM), "/totem");

    assert.equal(telaInicial("ADMIN"), "/admin");
    assert.equal(telaInicial("FUNCIONARIO"), "/ponto");
    assert.equal(telaInicial("TOTEM"), "/totem");

    // Passados os portões, cada um abre a sua área sem novo desvio.
    assert.equal(navegar("/admin", ADMIN), "/admin");
    assert.equal(navegar("/ponto", FUNC), "/ponto");
    assert.equal(navegar("/totem", TOTEM), "/totem");
  });

  it("o totem fica preso no quiosque", () => {
    assert.equal(navegar("/admin", TOTEM), "/totem");
    assert.equal(navegar("/ponto", TOTEM), "/totem");
  });

  it("quem não é ADMIN não entra no painel", () => {
    assert.equal(navegar("/admin", FUNC), "/ponto");
    assert.equal(navegar("/admin/funcionarios", FUNC), "/ponto");
  });

  it("o termo só segura depois que a senha já foi trocada", () => {
    // Senão o próprio endpoint de troca de senha ficaria bloqueado pelo portão
    // seguinte, e o funcionário novo não teria por onde começar.
    assert.equal(decidirRota("/api/auth/trocar-senha", FUNC_NOVO).tipo, "segue");
    assert.equal(navegar("/ponto", FUNC_SEM_TERMO), "/termos");
    assert.equal(decidirRota("/api/termos/aceitar", FUNC_SEM_TERMO).tipo, "segue");
  });

  it("sem sessão, página vai para o login e API responde 401", () => {
    assert.equal(navegar("/ponto", null), "/login");
    assert.equal(decidirRota("/api/registros", null).tipo, "naoAutorizado");
    assert.equal(decidirRota("/api/auth/login", null).tipo, "segue");
  });

  it("o logout funciona em qualquer portão", () => {
    for (const s of [TOTEM_NOVO, FUNC_NOVO, FUNC_SEM_TERMO, TOTEM, ADMIN]) {
      assert.equal(decidirRota("/api/auth/logout", s).tipo, "segue", `papel ${s.papel}`);
    }
  });
});
