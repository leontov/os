import type { PropsWithChildren, ReactNode } from "react";

interface LayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
}

const Layout = ({ sidebar, children }: PropsWithChildren<LayoutProps>) => (
  <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#E6F6FF] via-[#F6F2FF] to-[#FDF9F1] text-text-dark">
    <div className="pointer-events-none absolute -left-24 top-20 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
    <div className="pointer-events-none absolute bottom-0 right-[-120px] h-[420px] w-[420px] rounded-full bg-accent-coral/10 blur-[180px]" />
    <div className="pointer-events-none absolute top-32 right-40 h-64 w-64 rounded-full bg-[#4f46e566] blur-3xl" />
    <div className="relative z-10 mx-auto flex w-full max-w-[1400px] gap-8 px-6 py-10 lg:px-12 xl:gap-12 xl:py-16">
      <aside className="hidden w-80 shrink-0 lg:block xl:w-96">{sidebar}</aside>
      <main className="flex flex-1 flex-col space-y-8 lg:space-y-10 xl:space-y-12">{children}</main>
    </div>
  </div>
);

export default Layout;
