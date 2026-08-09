import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ben Dev Trade Bot",
  description: "Analyses crypto auto pour Telegram",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
