import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, LockKeyhole, Scissors } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const login = trpc.staff.login.useMutation({
    onSuccess: async ({ staff }) => {
      await queryClient.invalidateQueries();
      setLocation(staff.role === "super_admin" ? "/superadmin" : "/app");
    },
    onError: error => toast.error(error.message),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email: email.trim(), password });
  };

  return <main className="grid min-h-screen bg-[#f5f3ef] lg:grid-cols-[1fr_1fr]">
    <section className="relative hidden flex-col justify-between overflow-hidden bg-[#1c1c19] p-12 text-[#f4f0e8] lg:flex xl:p-16">
      <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-full border border-[#b59b6e]/60 text-[#c4a875]"><Scissors size={19}/></div><div><p className="font-serif text-xl tracking-wide">BARBEARIA PRIME</p><p className="mt-1 text-[9px] tracking-[.25em] text-[#a59c8d]">GESTÃO COM PRESENÇA</p></div></div>
      <div className="relative z-10 max-w-xl"><p className="text-[10px] uppercase tracking-[.25em] text-[#c2a775]">O cuidado está nos detalhes</p><h1 className="mt-5 font-serif text-5xl leading-[1.08]">Uma barbearia bem cuidada começa por uma boa gestão.</h1><p className="mt-5 max-w-md text-sm leading-7 text-[#b6b1a5]">Agenda, clientes e operação no mesmo lugar — com a personalidade da sua casa.</p></div>
      <p className="text-[10px] text-[#77746c]">BARBEARIA PRIME · PLATAFORMA DE GESTÃO</p><div aria-hidden className="absolute -bottom-48 -right-24 h-[520px] w-[520px] rounded-full border border-[#b59b6e]/10"/><div aria-hidden className="absolute -bottom-24 -right-0 h-[330px] w-[330px] rounded-full border border-[#b59b6e]/10"/>
    </section>
    <section className="flex items-center justify-center px-5 py-10 sm:px-10"><div className="w-full max-w-[390px]">
      <div className="mb-9 flex items-center gap-3 lg:hidden"><div className="grid h-10 w-10 place-items-center rounded-full border border-[#ad9163]/65 text-[#a08355]"><Scissors size={17}/></div><div><p className="font-serif text-[17px] tracking-wide">BARBEARIA PRIME</p><p className="mt-0.5 text-[8px] tracking-[.24em] text-[#8e897f]">GESTÃO COM PRESENÇA</p></div></div>
      <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-[#a08457]"><LockKeyhole size={13}/>Área da equipe</span><h2 className="mt-3 font-serif text-[34px] tracking-tight">Acesse sua conta.</h2><p className="mt-2 text-sm leading-6 text-[#817d74]">Entre com o e-mail e a senha cadastrados pela sua barbearia.</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="block"><span className="mb-2 block text-[11px] font-medium text-[#5f5c55]">E-mail</span><input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@barbearia.com.br" className="h-12 w-full rounded-sm border border-[#e2dfd8] bg-[#fbfaf8] px-3.5 text-sm outline-none transition focus:border-[#ad9469]"/></label>
        <label className="block"><span className="mb-2 block text-[11px] font-medium text-[#5f5c55]">Senha</span><span className="relative block"><input type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="h-12 w-full rounded-sm border border-[#e2dfd8] bg-[#fbfaf8] px-3.5 pr-11 text-sm outline-none transition focus:border-[#ad9469]"/><button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-3.5 text-[#8e8a82]">{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
        <button type="submit" disabled={login.isPending} className="h-12 w-full rounded-sm bg-[#292924] text-xs font-medium tracking-wide text-[#f5f0e5] transition hover:bg-[#47453c] disabled:cursor-wait disabled:opacity-50">{login.isPending ? "Entrando…" : "Entrar no painel"}</button>
      </form>
      <div className="mt-6 border-t border-[#e5e2dc] pt-5 text-[11px] leading-5 text-[#88847c]"><p>Esqueceu sua senha? Solicite uma redefinição ao administrador da sua barbearia.</p><p className="mt-2">Clientes podem agendar pelo link público enviado pela barbearia, sem criar conta.</p></div>
    </div></section>
  </main>;
}
