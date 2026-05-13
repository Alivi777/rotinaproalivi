import { Helmet } from "react-helmet-async";

interface SEOProps {
  title: string;
  description?: string;
  path: string;
}

const BASE = "https://rotinaproalivi.lovable.app";

export default function SEO({ title, description, path }: SEOProps) {
  const url = `${BASE}${path}`;
  const fullTitle = title.includes("Rotina Pro") ? title : `${title} | Rotina Pro`;
  const desc = description ?? "Painel de operação do time: rotina, prioridades, agenda clínica e WhatsApp.";
  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
    </Helmet>
  );
}
