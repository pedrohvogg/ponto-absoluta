/**
 * Decisao de roteamento do middleware, isolada do Next para poder ser testada.
 *
 * Um erro aqui nao aparece como excecao: aparece como ERR_TOO_MANY_REDIRECTS no
 * navegador do usuario. Por isso a regra mora numa funcao pura, com teste que
 * simula a navegacao ate ela parar — se nao parar, o teste acusa o laco.
 */

export type Papel = "ADMIN" | "FUNCIONARIO" | "TOTEM";

export type Sessao = {
  papel?: string;
  /** Senha ainda e a provisoria entregue pelo admin. */
  trocarSenha?: boolean;
  /** `false` so para quem precisa aceitar o termo (funcionario). */
  termoAceito?: boolean;
};

/** Rotas que qualquer visitante abre, com ou sem sessao. */
export const PUBLICAS = ["/login", "/api/auth/login"];

/** Enquanto a senha e provisoria, so estas passam. */
const LIBERADAS_NA_TROCA = ["/trocar-senha", "/api/auth/trocar-senha", "/api/auth/logout"];

/** Enquanto o termo nao foi aceito, so estas passam. */
const LIBERADAS_NO_TERMO = ["/termos", "/api/termos/aceitar", "/api/auth/logout"];

/**
 * Telas de transicao: nao pertencem a area de nenhum papel, mas todo papel
 * precisa poder abri-las antes de chegar na sua area. Sem esta isencao o totem
 * com senha provisoria entra em laco — o portao de senha o manda para
 * /trocar-senha e a regra de area o manda de volta para /totem, sem fim.
 */
const NEUTRAS = ["/trocar-senha", "/termos"];

export function telaInicial(papel: string | undefined): string {
  if (papel === "ADMIN") return "/admin";
  if (papel === "TOTEM") return "/totem";
  return "/ponto";
}

export type Decisao =
  | { tipo: "segue" }
  | { tipo: "redireciona"; destino: string }
  | { tipo: "naoAutorizado" };

/** Cookie que conta saltos seguidos, para cortar qualquer laço. */
export const COOKIE_SALTOS = "ponto_saltos";

/**
 * Quantos redirecionamentos seguidos ainda sao considerados normais. A maior
 * corrente legitima tem 2 saltos (/ -> /ponto -> /termos); 5 da folga de sobra.
 */
export const LIMITE_SALTOS = 5;

/** Motivo mostrado no login quando a rede de seguranca corta um laço. */
export const ERRO_LACO = "sessao_confusa";

/** Le o contador do cookie tolerando ausencia e lixo, e soma este salto. */
export function contarSalto(valorAtual: string | undefined): number {
  const lido = Number.parseInt(valorAtual ?? "", 10);
  return (Number.isInteger(lido) && lido > 0 ? lido : 0) + 1;
}

/**
 * Rede de seguranca contra ERR_TOO_MANY_REDIRECTS.
 *
 * As regras acima sao testadas e nao entram em laço, mas elas decidem a partir
 * do cookie enquanto as paginas decidem a partir do banco. Se os dois
 * discordarem — cookie antigo, senha trocada em outra aba, deploy no meio do
 * caminho — um pode mandar para onde o outro nao deixa entrar, e o usuario fica
 * olhando uma tela de erro do navegador sem saida nenhuma. Aqui o sistema
 * desiste antes disso: apaga a sessao e devolve ao login, que sempre abre.
 */
export function estourouSaltos(saltos: number): boolean {
  return saltos > LIMITE_SALTOS;
}

/**
 * Para onde vai um pedido. Os portoes sao sequenciais de proposito
 * (senha -> termo -> area): avaliados em paralelo, o portao do termo bloquearia
 * o proprio endpoint de troca de senha, que so vem antes dele.
 */
export function decidirRota(pathname: string, sessao: Sessao | null): Decisao {
  const ehApi = pathname.startsWith("/api/");

  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return { tipo: "segue" };
  }

  if (!sessao) {
    // A API responde 401 para o codigo do navegador tratar; a pagina redireciona.
    return ehApi ? { tipo: "naoAutorizado" } : { tipo: "redireciona", destino: "/login" };
  }

  if (sessao.trocarSenha && !LIBERADAS_NA_TROCA.includes(pathname)) {
    return { tipo: "redireciona", destino: "/trocar-senha" };
  }

  if (!sessao.trocarSenha && sessao.termoAceito === false && !LIBERADAS_NO_TERMO.includes(pathname)) {
    return { tipo: "redireciona", destino: "/termos" };
  }

  // Cada papel so enxerga a sua area. A conta do totem em especial fica presa no
  // quiosque: se o tablet for parar em maos erradas, nao ha nada a ver ali. As
  // rotas de API ficam de fora porque cada uma confere a permissao por si.
  if (!ehApi && !NEUTRAS.includes(pathname)) {
    const foraDaArea =
      (pathname.startsWith("/admin") && sessao.papel !== "ADMIN") ||
      (pathname.startsWith("/totem") && sessao.papel !== "TOTEM") ||
      (sessao.papel === "TOTEM" && !pathname.startsWith("/totem"));
    if (foraDaArea) {
      return { tipo: "redireciona", destino: telaInicial(sessao.papel) };
    }
  }

  return { tipo: "segue" };
}
