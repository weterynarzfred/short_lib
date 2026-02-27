import Link from "next/link";

import styles from './Nav.module.scss';

export default function Nav() {
  return <nav className={styles.nav}>
    <Link className={styles.navLink} href="/">home</Link>
    <Link className={styles.navLink} href="/listing">listing</Link>
    <Link className={styles.navLink} href="/upload">upload</Link>
    <Link className={styles.navLink} href="/tags">tags</Link>
  </nav>;
};
