
import React from 'react';
import './globals.css';

export const metadata = {
  title: 'PRISM Tactical HUD',
  description: 'Advanced AI-powered Tactical AR Interface',
};

export default function RootLayout({
  children,
}: {
  // Making children optional to resolve "missing children" type errors in some JSX environments 
  // where the compiler fails to correctly infer children from nested tags.
  children?: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@300;400;600;800&family=JetBrains+Mono:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-slate-950 text-slate-50 overflow-hidden">
        {children}
        <div className="scanlines fixed inset-0 pointer-events-none z-[100] opacity-[0.15]"></div>
      </body>
    </html>
  );
}
