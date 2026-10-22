'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import NotificationBell from '@/components/NotificationBell';
import LicenceBanner from '@/components/LicenceBanner';

function navFor(user, locale, t) {
  const p = (path) => `/${locale}${path}`;
  if (!user) return [{ href: p(''), label: t('nav.home') }];
  switch (user.role) {
    case 'customer':
      return [{ href: p(''), label: t('nav.home') }, { href: p('/account'), label: t('nav.myPolicies') }, ...(['owner', 'admin'].includes(user.customerRole) ? [{ href: p('/account/team'), label: t('nav.team') }] : [])];
    case 'risk_engineer':
      return [{ href: p('/backoffice/surveys'), label: t('nav.surveys') }];
    case 'broker_admin':
    case 'broker_user':
      return [{ href: p('/broker'), label: t('nav.broker') }, { href: p('/fire'), label: t('nav.newQuote') }, { href: p('/marine'), label: t('nav.marineQuote') }, { href: p('/wc'), label: t('nav.wcQuote') }, { href: p('/engineering'), label: t('nav.engQuote') }, { href: p('/broker/commissions'), label: t('nav.commissions') }];
    case 'config_admin':
      return [{ href: p('/backoffice/rates'), label: t('nav.rates') }, { href: p('/backoffice/reports'), label: t('nav.reports') }];
    case 'uw_manager':
      return [{ href: p('/backoffice/referrals'), label: t('nav.underwriting') }, { href: p('/backoffice/rates'), label: t('nav.rates') }, { href: p('/backoffice/payments'), label: t('nav.payments') }, { href: p('/backoffice/reports'), label: t('nav.reports') }];
    case 'ops':
      return [{ href: p('/backoffice/payments'), label: t('nav.payments') }, { href: p('/backoffice/reports'), label: t('nav.reports') }];
    default:
      return [{ href: p('/backoffice/referrals'), label: t('nav.underwriting') }, { href: p('/backoffice/reports'), label: t('nav.reports') }];
  }
}

export default function Header() {
  const { locale, t } = useI18n();
  const { user, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const other = locale === 'ar' ? 'en' : 'ar';
  const switchHref = pathname.replace(/^\/(en|ar)(?=\/|$)/, `/${other}`) + (typeof window !== 'undefined' ? window.location.search : '');

  const switchLanguage = (e) => {
    e.preventDefault();
    document.cookie = `locale=${other}; path=/; max-age=31536000; samesite=lax`;
    router.push(switchHref);
  };

  return (
    <header className="site-header">
      <div className="container">
        <Link className="brand" href={`/${locale}`}>{t('meta.insurer')}</Link>
        <nav className="site-nav" aria-label="Main">
          {[...navFor(user, locale, t), ...(user?.permissions?.includes('admin.access') ? [{ href: `/${locale}/admin`, label: t('nav.admin') }] : []), { href: `/${locale}/help`, label: t('nav.help') }].map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>{item.label}</Link>
          ))}
        </nav>
        <div className="header-end">
          <a href={switchHref} onClick={switchLanguage} lang={other}>{t('nav.language')}</a>
          {user ? (
            <>
              <NotificationBell />
              <span className="muted">{user.name || user.mobile || user.email}{user.broker ? ` · ${user.broker.name}` : ''}</span>
              <button type="button" className="btn btn-secondary" style={{ minHeight: 38 }} onClick={async () => { await signOut(); router.push(`/${locale}`); }}>{t('nav.signOut')}</button>
            </>
          ) : user === null ? (
            <Link className="btn btn-secondary" style={{ minHeight: 38 }} href={`/${locale}/login`}>{t('nav.signIn')}</Link>
          ) : null}
        </div>
      </div>
      {user?.permissions?.includes('admin.access') ? <LicenceBanner /> : null}
    </header>
  );
}
