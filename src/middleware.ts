import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  COOKIE_SALTOS,
  contarSalto,
  decidirRota,
  ERRO_LACO,
  estourouSaltos,
  type Sessao,
} from "@/lib/rotas";

const COOKIE = "ponto_sessao";

/**
 * Primeira barreira de acesso: valida a assinatura do cookie e direciona o
 * usuario. A regra de para-onde-vai mora em `lib/rotas` para ter teste; aqui
 * fica so a leitura do cookie e a traducao para a resposta do Next. A checagem
 * definitiva (usuario ativo, papel atual) acontece nas paginas/rotas com acesso
 * ao banco.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE)?.value;

  let sessao: Sessao | null = null;
  if (token && process.env.SESSION_SECRET) {
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(process.env.SESSION_SECRET),
      );
      sessao = payload as Sessao;
    } catch {
      sessao = null;
    }
  }

  const decisao = decidirRota(pathname, sessao);

  if (decisao.tipo === "naoAutorizado") {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  if (decisao.tipo === "redireciona") {
    const saltos = contarSalto(req.cookies.get(COOKIE_SALTOS)?.value);
    const url = req.nextUrl.clone();

    // Saltos demais seguidos: em vez de deixar o navegador cortar com
    // ERR_TOO_MANY_REDIRECTS, o sistema descarta a sessao e volta ao login.
    if (estourouSaltos(saltos)) {
      url.pathname = "/login";
      url.search = `?erro=${ERRO_LACO}`;
      const resposta = NextResponse.redirect(url);
      resposta.cookies.delete(COOKIE);
      resposta.cookies.delete(COOKIE_SALTOS);
      return resposta;
    }

    url.pathname = decisao.destino;
    url.search = "";
    const resposta = NextResponse.redirect(url);
    resposta.cookies.set(COOKIE_SALTOS, String(saltos), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10,
    });
    return resposta;
  }

  // Chegou a uma pagina de verdade: a contagem recomeça.
  const resposta = NextResponse.next();
  if (req.cookies.has(COOKIE_SALTOS)) resposta.cookies.delete(COOKIE_SALTOS);
  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|models|favicon.ico|.*\\.png$).*)"],
};
