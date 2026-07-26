"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { usePageReset } from "./PageResetProvider";

import styles from './Nav.module.scss';

const NAV_LINKS = [
  { href: "/", label: "home" },
  { href: "/listing", label: "listing" },
  { href: "/upload", label: "upload" },
  { href: "/tags", label: "tags" },
  { href: "/settings", label: "settings" },
];

export default function Nav() {
  const pathname = usePathname();
  const { requestPageReset } = usePageReset();

  return <nav className={styles.nav}>
    {NAV_LINKS.map(({ href, label }) => (
      <Link
        key={href}
        className={styles.navLink}
        href={href}
        // Navigating elsewhere unmounts the page and clears its state anyway. Only a click
        // on the current page needs an explicit signal.
        onClick={() => {
          if (pathname === href) requestPageReset();
        }}
      >{label}</Link>
    ))}
  </nav>;
};
