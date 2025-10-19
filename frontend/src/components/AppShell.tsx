import type { PropsWithChildren, ReactNode } from "react";

interface AppShellProps {
  navigation?: ReactNode;
  mobileNavigation?: ReactNode;
  header?: ReactNode;
  inspector?: ReactNode;
  footer?: ReactNode;
}

const AppShell = ({ navigation, mobileNavigation, header, inspector, footer, children }: PropsWithChildren<AppShellProps>) => (
  <div className="relative isolate min-h-screen overflow-hidden text-text-primary">
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute -left-40 top-[-18rem] h-[36rem] w-[36rem] rounded-full bg-primary/20 blur-[160px]" aria-hidden="true" />
      <div className="absolute right-[-12rem] top-[-8rem] h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-[140px]" aria-hidden="true" />
      <div className="absolute bottom-[-16rem] left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-primary/15 blur-[180px]" aria-hidden="true" />
    </div>
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[120rem] flex-col px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-8 transition-[padding] sm:px-6 lg:px-10 lg:pb-16">
      <div className="flex items-start gap-6 lg:gap-10">
        {navigation ? <aside className="hidden w-[5.5rem] flex-none lg:block xl:w-[6.5rem]">{navigation}</aside> : null}
        <div className="flex min-h-[70vh] flex-1 flex-col gap-6 lg:gap-8">
          {header}
          <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:gap-8">
            <section className="flex min-h-[24rem] flex-1 flex-col gap-6">{children}</section>
            {inspector ? <aside className="hidden w-full max-w-sm flex-none lg:flex lg:max-w-md">{inspector}</aside> : null}
          </div>
          {footer ? <div className="mt-auto">{footer}</div> : null}
        </div>
      </div>
    </div>
    {mobileNavigation ? (
      <div className="glass-panel-strong fixed inset-x-0 bottom-0 z-40 border-t border-border-strong/40 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-22px_65px_-32px_rgba(15,23,42,0.65)] backdrop-blur lg:hidden">
        {mobileNavigation}
      </div>
    ) : null}
  </div>
);

export default AppShell;
