"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, SquarePen } from "lucide-react";

const items = [
  { href: "/explorar", label: "Praticar", matches: (pathname: string) => pathname === "/" || pathname.startsWith("/explorar") || pathname.startsWith("/problemas/") || pathname.startsWith("/submissoes") },
  { href: "/studio", label: "Studio", matches: (pathname: string) => pathname.startsWith("/studio") || pathname.startsWith("/assistente") || pathname.startsWith("/minhas-questoes") || pathname.startsWith("/admin/revisao") }
];

export function PrimaryNavigation() {
  const pathname = usePathname();
  return <div className="nav-links">{items.map((item) => (
    <Link key={item.href} href={item.href} aria-current={item.matches(pathname) ? "page" : undefined}>{item.label === "Praticar" ? <BookOpen size={16} aria-hidden="true" /> : <SquarePen size={16} aria-hidden="true" />}<span>{item.label}</span></Link>
  ))}</div>;
}
