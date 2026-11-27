import {
  ArrowRight,
  ArrowUpRight,
  BadgePercent,
  BarChart3,
  CalendarDays,
  Check,
  Clock3,
  MessageCircle,
  Scissors,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { Link } from "wouter";

const WHATSAPP_NUMBER = "5561920051259";

function whatsappLink(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

const sharedFeatures = [
  "Agendamento online e página pública da barbearia",
  "Agenda, equipe e cadastro de clientes",
  "Serviços, planos, promoções e cupons",
  "Caixa, financeiro, comissões e relatórios",
  "Estoque, fidelidade e avaliações",
];

const benefits = [
  {
    icon: CalendarDays,
    title: "Agendamentos em ordem",
    text: "Organize horários, profissionais e serviços em uma agenda conectada à página pública da sua barbearia.",
  },
  {
    icon: UsersRound,
    title: "Equipe e clientes no mesmo lugar",
    text: "Acompanhe a operação da equipe e mantenha o histórico de relacionamento com seus clientes.",
  },
  {
    icon: WalletCards,
    title: "Gestão para decidir melhor",
    text: "Reúna caixa, financeiro, comissões, estoque e relatórios em uma única plataforma.",
  },
  {
    icon: BadgePercent,
    title: "Mais formas de fidelizar",
    text: "Use planos, promoções, cupons, fidelidade e avaliações para fortalecer o relacionamento com a clientela.",
  },
];

function WhatsAppButton({
  children,
  message,
  className = "",
  variant = "gold",
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  variant?: "gold" | "dark" | "outline";
}) {
  const styles = {
    gold: "bg-[#c6a76e] text-[#171714] hover:bg-[#d4b982]",
    dark: "bg-[#24231f] text-white hover:bg-[#34322c]",
    outline: "border border-[#746a56]/35 text-[#2b2923] hover:border-[#a98d5c] hover:bg-[#f7f3ea]",
  };
  return (
    <a
      href={whatsappLink(message)}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-sm px-5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ae8d54] ${styles[variant]} ${className}`}
    >
      {children}
      <ArrowUpRight size={16} aria-hidden="true" />
    </a>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.24em] text-[#a88c59]">
      <span className="h-px w-7 bg-[#a88c59]" aria-hidden="true" />
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f5f3ee] text-[#24231f]">
      <header className="border-b border-[#2d2a24]/10 bg-[#f8f7f3]">
        <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <a href="#inicio" className="flex items-center gap-3" aria-label="Barbearia Prime, início">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-[#b59b6e]/60 text-[#a88c59]">
              <Scissors size={17} aria-hidden="true" />
            </span>
            <span>
              <span className="block font-serif text-[17px] tracking-wide">BARBEARIA PRIME</span>
              <span className="mt-0.5 block text-[8px] tracking-[.24em] text-[#888174]">GESTÃO COM PRESENÇA</span>
            </span>
          </a>
          <nav className="flex items-center gap-3 sm:gap-7" aria-label="Navegação principal">
            <a href="#recursos" className="hidden text-xs text-[#69655d] transition hover:text-[#171714] sm:inline">Recursos</a>
            <a href="#planos" className="hidden text-xs text-[#69655d] transition hover:text-[#171714] sm:inline">Planos</a>
            <a href={whatsappLink("Olá! Quero saber mais sobre o sistema Barbearia Prime.")} target="_blank" rel="noreferrer" className="text-xs text-[#69655d] transition hover:text-[#171714]">Saiba mais</a>
            <Link href="/login" className="inline-flex h-10 items-center gap-2 rounded-sm border border-[#6d6658]/35 px-3 text-xs transition hover:border-[#a88c59] sm:px-4">
              Acessar painel <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <section id="inicio" className="relative bg-[#1d1d19] text-[#f4f0e8]">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[.9fr_1.1fr] lg:gap-16 lg:py-24">
          <div className="relative z-10">
            <SectionLabel>O cuidado está nos detalhes</SectionLabel>
            <h1 className="mt-6 max-w-2xl font-serif text-[42px] leading-[1.07] tracking-[-.03em] sm:text-6xl xl:text-[68px]">
              Sua barbearia. Sua agenda. Tudo sob controle.
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-[#c3beb3] sm:text-base">
              Agendamento online e gestão completa para organizar a rotina da sua barbearia — com a personalidade da sua casa.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <WhatsAppButton message="Olá! Quero testar o sistema Barbearia Prime por 7 dias." variant="gold">
                Quero testar grátis
              </WhatsAppButton>
              <a href="#planos" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-sm border border-white/20 px-5 text-sm text-[#f4f0e8] transition hover:border-[#c6a76e]">
                Ver planos <ArrowRight size={15} aria-hidden="true" />
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[10px] text-[#aaa497]">
              <span className="inline-flex items-center gap-2"><Clock3 size={13} className="text-[#c6a76e]" aria-hidden="true" />7 dias para testar</span>
              <span className="inline-flex items-center gap-2"><ShieldCheck size={13} className="text-[#c6a76e]" aria-hidden="true" />Sem instalação</span>
            </div>
          </div>
          <figure className="relative mx-auto w-full max-w-[360px] lg:mr-10">
            <div className="absolute -inset-5 rounded-full bg-[#c6a76e]/[.08] blur-3xl" aria-hidden="true" />
            <div className="relative mx-auto max-w-[300px] rounded-[2.4rem] border-[8px] border-[#11110f] bg-[#11110f] p-1.5 shadow-[0_28px_80px_rgba(0,0,0,.4)]">
              <div className="overflow-hidden rounded-[1.8rem] bg-[#f5f3ee]">
                <div className="mx-auto mt-2 h-3.5 w-20 rounded-full bg-[#11110f]" aria-hidden="true" />
                <img
                  src="/images/agendamento-servicos-mobile.png"
                  alt="Captura real em formato de celular da seleção de serviços, com barba completa, corte clássico e corte degradê"
                  className="block h-auto w-full"
                  fetchPriority="high"
                />
              </div>
            </div>
            <figcaption className="relative mt-4 text-center text-[9px] uppercase tracking-[.16em] text-[#c3beb3]">Seleção real de serviços · celular</figcaption>
          </figure>
        </div>
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full border border-white/[.06]" aria-hidden="true" />
      </section>

      <section id="recursos" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="max-w-2xl">
          <SectionLabel>Uma gestão que acompanha seu ritmo</SectionLabel>
          <h2 className="mt-5 font-serif text-3xl leading-tight sm:text-5xl">Menos abas abertas. Mais clareza na operação.</h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-[#777267]">As ferramentas do dia a dia da barbearia reunidas em uma plataforma, da marcação do horário ao acompanhamento da gestão.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map(({ icon: Icon, title, text }, index) => (
            <article key={title} className="group border border-[#28251f]/10 bg-[#faf9f6] p-5 transition hover:-translate-y-1 hover:border-[#b59b6e]/50 hover:shadow-[0_12px_34px_rgba(43,38,28,.08)] sm:p-6">
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-full border border-[#b59b6e]/30 bg-[#f3eee3] text-[#94794b]"><Icon size={19} aria-hidden="true" /></span>
                <span className="font-serif text-sm text-[#a99d85]">0{index + 1}</span>
              </div>
              <h3 className="mt-7 font-serif text-xl">{title}</h3>
              <p className="mt-2 text-xs leading-6 text-[#777267]">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-[#28251f]/10 bg-[#ebe8e0]">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_.72fr]">
          <div>
            <SectionLabel>Feito para funcionar em qualquer tela</SectionLabel>
            <h2 className="mt-5 max-w-xl font-serif text-3xl leading-tight sm:text-5xl">Seu cliente agenda pelo celular. Você acompanha a operação.</h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-[#777267]">A página pública mostra serviços e horários em uma experiência simples, sem exigir que o cliente instale um aplicativo.</p>
            <ul className="mt-7 space-y-3 text-sm text-[#514d44]">
              {["Escolha de serviços e horários disponíveis", "Consulta de agendamentos e ofertas", "Acesso pelo link da própria barbearia"].map((item) => (
                <li key={item} className="flex items-start gap-3"><Check size={16} className="mt-0.5 shrink-0 text-[#95794a]" aria-hidden="true" />{item}</li>
              ))}
            </ul>
            <div className="mt-8">
              <WhatsAppButton message="Olá! Quero saber mais sobre o agendamento online da Barbearia Prime." variant="dark">
                Saiba mais pelo WhatsApp
              </WhatsAppButton>
            </div>
          </div>
          <figure className="mx-auto w-full max-w-[320px]">
            <div className="rounded-[2rem] border-[7px] border-[#25241f] bg-[#25241f] p-1.5 shadow-[0_24px_55px_rgba(45,40,31,.24)]">
              <div className="overflow-hidden rounded-[1.35rem] bg-white">
                <img
                  src="/images/agendamento-real-mobile.png"
                  alt="Captura real da experiência de agendamento da barbearia em uma tela de celular"
                  className="block h-auto w-full"
                  loading="lazy"
                />
              </div>
            </div>
            <figcaption className="mt-4 text-center text-[10px] uppercase tracking-[.18em] text-[#787266]">Captura real · versão para celular</figcaption>
          </figure>
        </div>
      </section>

      <section id="planos" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <SectionLabel>Escolha como quer começar</SectionLabel>
          <h2 className="mt-5 font-serif text-3xl leading-tight sm:text-5xl">Dois planos. A mesma gestão completa.</h2>
          <p className="mt-4 text-sm leading-7 text-[#777267]">Teste grátis por 7 dias. Todos os recursos de gestão estão incluídos nos dois planos; o Premium acrescenta IA no WhatsApp.</p>
        </div>
        <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
          <article className="flex flex-col border border-[#28251f]/15 bg-[#faf9f6] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#847b6c]">Plano Top</p><h3 className="mt-2 font-serif text-2xl">Tudo para gerir</h3></div>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#efeade] text-[#94794b]"><BarChart3 size={18} aria-hidden="true" /></span>
            </div>
            <p className="mt-5 flex items-baseline gap-1"><span className="text-sm text-[#706b60]">R$</span><span className="font-serif text-5xl tracking-tight">59,90</span><span className="text-xs text-[#777267]">/ mês</span></p>
            <p className="mt-2 text-xs text-[#777267]">7 dias grátis para experimentar.</p>
            <div className="my-6 h-px bg-[#28251f]/10" />
            <p className="text-xs font-semibold text-[#37342d]">Todas as funcionalidades de gestão:</p>
            <ul className="mt-4 flex-1 space-y-3">
              {sharedFeatures.map((feature) => <li key={feature} className="flex gap-2.5 text-xs leading-5 text-[#625e55]"><Check size={15} className="mt-0.5 shrink-0 text-[#92774b]" aria-hidden="true" />{feature}</li>)}
            </ul>
            <p className="mt-5 rounded-sm bg-[#f1eee7] px-3 py-2.5 text-xs text-[#706b60]">Sem IA no WhatsApp.</p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <WhatsAppButton className="w-full px-3 text-xs" message="Olá! Quero testar o Plano Top da Barbearia Prime por 7 dias." variant="dark">Quero testar</WhatsAppButton>
              <WhatsAppButton className="w-full px-3 text-xs" message="Olá! Quero assinar o Plano Top da Barbearia Prime, por R$ 59,90 ao mês." variant="outline">Quero assinar</WhatsAppButton>
            </div>
          </article>

          <article className="relative flex flex-col border border-[#a88c59] bg-[#22221e] p-6 text-[#f4f0e8] shadow-[0_20px_60px_rgba(45,40,31,.16)] sm:p-8">
            <div className="absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-[#c6a76e] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[.15em] text-[#211f1a]"><Sparkles size={12} aria-hidden="true" />Com IA</div>
            <div className="flex items-start justify-between gap-3 pr-20">
              <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#cfb783]">Plano Premium</p><h3 className="mt-2 font-serif text-2xl">Gestão + inteligência</h3></div>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#c6a76e]/35 text-[#cfb783]"><MessageCircle size={18} aria-hidden="true" /></span>
            </div>
            <p className="mt-5 flex items-baseline gap-1"><span className="text-sm text-[#c6bfae]">R$</span><span className="font-serif text-5xl tracking-tight">149,90</span><span className="text-xs text-[#c6bfae]">/ mês</span></p>
            <p className="mt-2 text-xs text-[#c6bfae]">7 dias grátis para experimentar.</p>
            <div className="my-6 h-px bg-white/10" />
            <p className="text-xs font-semibold text-[#f0ece3]">Tudo do Plano Top, mais:</p>
            <ul className="mt-4 flex-1 space-y-3">
              {sharedFeatures.map((feature) => <li key={feature} className="flex gap-2.5 text-xs leading-5 text-[#d2cdc2]"><Check size={15} className="mt-0.5 shrink-0 text-[#cfb783]" aria-hidden="true" />{feature}</li>)}
              <li className="flex gap-2.5 text-xs leading-5 text-[#f4f0e8]"><Sparkles size={15} className="mt-0.5 shrink-0 text-[#cfb783]" aria-hidden="true" />IA no WhatsApp</li>
            </ul>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <WhatsAppButton className="w-full px-3 text-xs" message="Olá! Quero testar o Plano Premium da Barbearia Prime por 7 dias, com IA no WhatsApp." variant="gold">Quero testar</WhatsAppButton>
              <WhatsAppButton className="w-full border-white/25 px-3 text-xs text-[#f4f0e8] hover:bg-white/10" message="Olá! Quero assinar o Plano Premium da Barbearia Prime, por R$ 149,90 ao mês, com IA no WhatsApp." variant="outline">Quero assinar</WhatsAppButton>
            </div>
          </article>
        </div>
        <p className="mx-auto mt-5 max-w-3xl text-center text-[10px] leading-5 text-[#817b70]">Valores mensais informados para os planos da plataforma. Para iniciar o teste grátis ou contratar, fale com a equipe pelo WhatsApp.</p>
      </section>

      <section className="bg-[#e9e5dc]">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-12 sm:px-8 sm:py-16 md:grid-cols-[1fr_auto]">
          <div><SectionLabel>Comece no seu ritmo</SectionLabel><h2 className="mt-4 max-w-2xl font-serif text-3xl leading-tight sm:text-4xl">Experimente a gestão completa por 7 dias.</h2><p className="mt-3 text-sm text-[#777267]">Tire dúvidas e escolha seu plano direto com a nossa equipe.</p></div>
          <WhatsAppButton message="Olá! Quero saber como começar meu teste grátis de 7 dias da Barbearia Prime." variant="dark" className="w-full md:w-auto">Quero testar grátis</WhatsAppButton>
        </div>
      </section>

      <footer className="bg-[#1d1d19] text-[#f4f0e8]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <a href="#inicio" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-[#b59b6e]/50 text-[#c6a76e]"><Scissors size={15} aria-hidden="true" /></span>
            <span><span className="block font-serif text-sm tracking-wide">BARBEARIA PRIME</span><span className="mt-0.5 block text-[8px] uppercase tracking-[.2em] text-[#9d978a]">Gestão com presença</span></span>
          </a>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-[#bab4a8]">
            <a href="#recursos" className="hover:text-white">Recursos</a><a href="#planos" className="hover:text-white">Planos</a>
            <Link href="/login" className="hover:text-white">Acessar painel</Link>
            <a href={whatsappLink("Olá! Quero saber mais sobre o sistema Barbearia Prime.")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[#cfb783] hover:text-white">Falar pelo WhatsApp <ArrowUpRight size={13} aria-hidden="true" /></a>
          </div>
        </div>
        <div className="border-t border-white/10 px-5 py-4 text-center text-[9px] text-[#777267]">BARBEARIA PRIME · Plataforma de gestão e agendamento</div>
      </footer>
    </main>
  );
}
