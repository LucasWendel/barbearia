import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const change = trpc.staff.changePassword.useMutation({
    onSuccess: async () => { toast.success("Senha atualizada."); await utils.staff.me.invalidate(); setLocation("/app"); },
    onError: error => toast.error(error.message),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) { toast.error("As novas senhas não coincidem."); return; }
    change.mutate({ currentPassword, newPassword });
  };
  return <main className="grid min-h-screen place-items-center bg-[#f5f3ef] px-5 py-10"><section className="w-full max-w-md rounded-sm border border-[#e7e4de] bg-[#fbfaf8] p-6 sm:p-8"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#a28658]">Segurança da conta</p><h1 className="mt-2 font-serif text-3xl">Crie sua senha pessoal.</h1><p className="mt-2 text-sm leading-6 text-[#817d74]">A senha temporária precisa ser trocada antes de continuar. Use pelo menos 12 caracteres.</p><form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-[11px] font-medium text-[#5f5c55]">Senha atual<input type="password" required autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="mt-2 h-11 w-full rounded-sm border border-[#e2dfd8] bg-white px-3 text-sm outline-none focus:border-[#ad9469]"/></label><label className="block text-[11px] font-medium text-[#5f5c55]">Nova senha<input type="password" required minLength={12} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} className="mt-2 h-11 w-full rounded-sm border border-[#e2dfd8] bg-white px-3 text-sm outline-none focus:border-[#ad9469]"/></label><label className="block text-[11px] font-medium text-[#5f5c55]">Confirmar nova senha<input type="password" required minLength={12} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="mt-2 h-11 w-full rounded-sm border border-[#e2dfd8] bg-white px-3 text-sm outline-none focus:border-[#ad9469]"/></label><button disabled={change.isPending} className="h-11 w-full rounded-sm bg-[#292924] text-xs font-medium text-[#f5f0e5] disabled:opacity-50">{change.isPending ? "Salvando…" : "Salvar nova senha"}</button></form></section></main>;
}
