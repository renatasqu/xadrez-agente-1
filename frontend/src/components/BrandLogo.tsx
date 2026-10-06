export function BrandLogo() {
  return <h1 className="arena-brand">
    <a href="#/partida" title="Voltar à partida"><img className="official-brand-logo" src={`${import.meta.env.BASE_URL}images/logo-xadrez-multiagente.png`} alt="XADREZ MULTIAGENTE" width="1983" height="793" /></a>
  </h1>;
}
