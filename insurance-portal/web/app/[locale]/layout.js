import { notFound } from 'next/navigation';
import '../globals.css';
import { LOCALES, isLocale, getDictionary, dirFor } from '@/lib/i18n';
import { I18nProvider } from '@/lib/i18n/client';
import { SessionProvider } from '@/lib/session';
import { FieldConfigProvider } from '@/lib/fieldConfig';
import Header from '@/components/Header';

export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const dict = getDictionary(locale);
  return { title: `${dict.meta.title} · ${dict.meta.insurer}` };
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  return (
    <html lang={locale} dir={dirFor(locale)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <I18nProvider locale={locale} dict={dict}>
          <SessionProvider>
            <FieldConfigProvider>
            <Header />
            <main>{children}</main>
            <footer className="site-footer">
              <div className="container spread">
                <span>{dict.meta.insurer} · CBUAE</span>
                <span>© {new Date().getFullYear()}</span>
              </div>
            </footer>
            </FieldConfigProvider>
          </SessionProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
