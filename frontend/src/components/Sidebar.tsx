import {
  BarChart3,
  Bot,
  Clock3,
  MessageCircle,
  Settings,
  Sparkles,
} from "lucide-react";
import NavItem from "./NavItem";

const Sidebar = () => (
  <div className="flex h-full flex-col justify-between rounded-[32px] border border-white/40 bg-white/70 p-8 shadow-hero backdrop-blur-xl">
    <div className="space-y-10">
      <div>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 via-white to-primary/20 shadow-card">
            <img src="/kolibri.svg" alt="Колибри" className="h-10 w-10" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Kolibri OS</p>
            <p className="mt-1 text-xl font-semibold text-text-dark">Визуальная Кора</p>
          </div>
        </div>
        <p className="mt-6 text-sm leading-relaxed text-text-light">
          Навигация по ключевым пространствам разума Колибри и быстрый доступ к состояниям ядра.
        </p>
      </div>
      <nav className="space-y-2">
        <NavItem icon={MessageCircle} label="Диалоги" active />
        <NavItem icon={Sparkles} label="Действия" />
        <NavItem icon={BarChart3} label="Визуализация" />
        <NavItem icon={Clock3} label="История" />
        <NavItem icon={Settings} label="Настройки" />
      </nav>
    </div>
    <div className="flex items-center gap-3 rounded-2xl border border-white/50 bg-gradient-to-r from-white/90 to-white/60 p-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Bot className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-semibold text-text-dark">Vladislav Kochurov</p>
        <p className="text-xs text-text-light">Колибри может допускать ошибки.</p>
      </div>
    </div>
  </div>
);

export default Sidebar;
