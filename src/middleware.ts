import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { decidirRota, type Sessao } from "@/lib/rotas";

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
    const url = req.nextUrl.clone();
    url.pathname = decisao.destino;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|models|favicon.ico|.*\\.png$).*)"],
};
