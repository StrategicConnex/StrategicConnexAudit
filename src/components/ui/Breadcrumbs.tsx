import React from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  name: string;
  path?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-8 select-none">
      <ol className="flex flex-wrap items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md text-sm font-medium w-fit max-w-full">
        <li className="flex items-center">
          <Link 
            href="/" 
            className="flex items-center gap-1.5 text-gray-400 hover:text-gold transition-colors duration-200"
          >
            <Home className="w-3.5 h-3.5" />
            <span className="sr-only">Inicio</span>
          </Link>
        </li>
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={idx} className="flex items-center gap-2">
              <ChevronRight className="w-3.5 h-3.5 text-white/20 shrink-0" />
              {isLast || !item.path ? (
                <span className="text-gold font-semibold truncate max-w-[200px]" aria-current="page">
                  {item.name}
                </span>
              ) : (
                <Link 
                  href={item.path} 
                  className="text-gray-400 hover:text-white transition-colors duration-200 truncate max-w-[150px]"
                >
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
