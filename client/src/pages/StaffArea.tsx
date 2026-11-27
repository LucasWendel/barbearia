import { useEffect } from "react";
import { useLocation } from "wouter";
import { LoaderCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import LoginPage from "@/pages/Login";
import ChangePasswordPage from "@/pages/ChangePassword";
import OperationsConsole from "@/pages/OperationsConsole";
import BusinessConsole from "@/pages/BusinessConsole";
import SuperAdminPage from "@/pages/SuperAdmin";

export function TenantArea() {
  const [location, setLocation] = useLocation();
  const auth = trpc.staff.me.useQuery(undefined, { retry: false });
  useEffect(() => {
    if (auth.data?.staff.role === "super_admin") setLocation("/superadmin");
  }, [auth.data, setLocation]);
  if (auth.isPending) return <div className="grid min-h-screen place-items-center bg-[#f5f3ef]"><LoaderCircle className="animate-spin text-[#9b8054]"/></div>;
  if (!auth.data) return <LoginPage/>;
  if (auth.data.staff.role === "super_admin") return <div className="grid min-h-screen place-items-center text-sm text-[#817d74]">Abrindo administração…</div>;
  if (auth.data.staff.mustChangePassword) return <ChangePasswordPage/>;
  return ["/app/caixa", "/app/financeiro", "/app/planos", "/app/promocoes", "/app/estoque", "/app/comissoes", "/app/relatorios"].includes(location) ? <BusinessConsole/> : <OperationsConsole/>;
}

export function SuperAdminArea() {
  const [, setLocation] = useLocation();
  const auth = trpc.staff.me.useQuery(undefined, { retry: false });
  useEffect(() => {
    if (auth.data && auth.data.staff.role !== "super_admin") setLocation("/app");
  }, [auth.data, setLocation]);
  if (auth.isPending) return <div className="grid min-h-screen place-items-center bg-[#f5f3ef]"><LoaderCircle className="animate-spin text-[#9b8054]"/></div>;
  if (!auth.data) return <LoginPage/>;
  if (auth.data.staff.mustChangePassword) return <ChangePasswordPage/>;
  if (auth.data.staff.role !== "super_admin") return <div className="grid min-h-screen place-items-center text-sm text-[#817d74]">Redirecionando…</div>;
  return <SuperAdminPage/>;
}
