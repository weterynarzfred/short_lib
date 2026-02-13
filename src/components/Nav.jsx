import Link from "next/link";

import './Nav.scss';

export default function Nav() {
  return <nav>
    <Link href="/">home</Link>
    <Link href="/upload">upload</Link>
  </nav>;
};
