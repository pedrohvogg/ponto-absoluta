/**
 * Identifica a versao que esta no ar.
 *
 * Existe porque "corrigi e enviei" e "o site ja esta com a correcao" sao coisas
 * diferentes: entre uma e outra ha um deploy que pode falhar, demorar ou estar
 * apontando para outro branch. Sem um numero visivel na tela nao da para saber
 * qual das duas hipoteses explica um erro que insiste em aparecer.
 *
 * A Vercel injeta VERCEL_GIT_COMMIT_SHA na build.
 */
export function versaoImplantada(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : "local";
}
