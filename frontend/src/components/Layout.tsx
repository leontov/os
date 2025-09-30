import type { PropsWithChildren, ReactNode } from "react";

interface LayoutProps {
  sidebar: ReactNode;
  metricsPanel?: ReactNode;
  children: ReactNode;
}

const Layout = ({ sidebar, metricsPanel, children }: PropsWithChildren<LayoutProps>) => (
  <div className="min-h-screen bg-background-light text-text-dark">
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 lg:flex-row lg:px-12">
      <aside className="hidden w-80 shrink-0 lg:block">{sidebar}</aside>
      <main className="flex flex-1 flex-col space-y-6 lg:space-y-8">
        {children}
        {metricsPanel ? <div className="lg:hidden">{metricsPanel}</div> : null}
      </main>
      {metricsPanel ? (
        <aside className="hidden w-80 shrink-0 lg:block">{metricsPanel}</aside>
      ) : null}
    </div>
  </div>
);

export default Layout;
