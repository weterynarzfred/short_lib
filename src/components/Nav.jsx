import Link from "next/link";

import './Nav.scss';

export default function Nav() {
  return <nav>
    <Link href="/">home</Link>
    <Link href="/listing">listing</Link>
    <Link href="/upload">upload</Link>
    <Link href="/tags">tags</Link>
  </nav>;
};
