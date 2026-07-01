'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { studioEntryUrl } from '@/lib/studio-session-client';

export default function Header() {
    const pathname = usePathname();

    return (
        <header className="header">
            <div className="header-inner">
                <Link href="/" className="header-logo">
                    <span>
                        Premium Jewelry <span className="gradient-text">Model Studio</span>
                    </span>
                </Link>

                <div className="header-center">
                    <span className="header-model-badge">
                        <span className="header-model-dot" />
                        AI Image Generation
                    </span>
                </div>

                <nav className="header-nav">
                    <Link href={studioEntryUrl()} className={pathname === '/studio' ? 'nav-active' : ''}>
                        Studio
                    </Link>
                    <Link href="/history" className={pathname === '/history' ? 'nav-active' : ''}>
                        History
                    </Link>
                    <Link href={studioEntryUrl()} className="btn btn-primary" style={{ padding: '0.45rem 1.1rem', fontSize: '0.82rem' }}>
                        ✦ Open Studio
                    </Link>
                </nav>
            </div>
        </header>
    );
}
